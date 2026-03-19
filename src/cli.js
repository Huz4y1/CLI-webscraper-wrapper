import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { GDKBrowser } from './browser.js';
import { renderHeader, renderMenu, renderItem, renderBasket, renderStores } from './render.js';

const browser = new GDKBrowser();

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n  Closing browser and exiting…'));
  await browser.close();
  process.exit(0);
});

async function main() {
  renderHeader();

  const spinner = ora('Launching browser…').start();
  await browser.launch();
  spinner.succeed('Browser ready');

  await browser.setCountryUK();

  const store = await selectStore();

  await browser.selectStore(store.id, store.name);

  await orderingLoop();
}

async function selectStore() {
  const { postcode } = await inquirer.prompt([{
    type: 'input',
    name: 'postcode',
    message: chalk.cyan('Enter your postcode:'),
    validate: v => v.trim().length >= 5 || 'Please enter a valid postcode',
  }]);

  const spinner = ora('Searching stores near ' + postcode.toUpperCase() + '…').start();
  let stores;
  try {
    stores = await browser.searchStores(postcode.trim());
    spinner.succeed(`Found ${stores.length} store(s)`);
  } catch (e) {
    spinner.fail('Store search failed: ' + e.message);
    process.exit(1);
  }

  if (!stores.length) {
    console.log(chalk.red('No stores found for that postcode. Try another.'));
    return selectStore();
  }

  renderStores(stores);

  const { storeChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'storeChoice',
    message: chalk.cyan('Choose a store:'),
    choices: stores.map(s => ({ name: `${s.name}  ${chalk.grey(s.address)}`, value: s })),
  }]);

  return storeChoice;
}

async function orderingLoop() {
  while (true) {
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: chalk.cyan('What would you like to do?'),
      choices: [
        { name: '  Browse menu',       value: 'menu' },
        { name: '  View basket',        value: 'basket' },
        { name: '  Go to checkout',     value: 'checkout' },
        { name: '  Change store',       value: 'change_store' },
        { name: '  Exit',               value: 'exit' },
      ],
    }]);

    switch (action) {
      case 'menu':         await browseMenu(); break;
      case 'basket':       await viewBasket(); break;
      case 'checkout':     await goCheckout(); break;
      case 'change_store': { const s = await selectStore(); await browser.selectStore(s.id, s.name); break; }
      case 'exit':         await browser.close(); process.exit(0);
    }
  }
}

async function browseMenu() {
  const spinner = ora('Loading menu categories…').start();
  let categories;
  try {
    categories = await browser.getCategories();
    spinner.succeed('Menu loaded');
  } catch (e) {
    spinner.fail('Failed to load menu: ' + e.message);
    return;
  }

  renderMenu(categories);

  const { cat } = await inquirer.prompt([{
    type: 'list',
    name: 'cat',
    message: chalk.cyan('Choose a category:'),
    choices: [
      ...categories.map(c => ({ name: c.name, value: c })),
      { name: chalk.grey('← Back'), value: null },
    ],
  }]);

  if (!cat) return;
  await browseCategory(cat);
}

async function browseCategory(category) {
  const spinner = ora(`Loading ${category.name}…`).start();
  let items;
  try {
    items = await browser.getCategoryItems(category.id);
    spinner.succeed(`${items.length} item(s) in ${category.name}`);
  } catch (e) {
    spinner.fail('Failed to load items: ' + e.message);
    return;
  }

  const { itemChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'itemChoice',
    message: chalk.cyan(`Choose an item from ${chalk.bold(category.name)}:`),
    choices: [
      ...items.map(i => ({
        name: `${i.name}  ${chalk.green(i.price)}  ${chalk.grey(i.calories || '')}`,
        value: i,
      })),
      { name: chalk.grey('← Back'), value: null },
    ],
  }]);

  if (!itemChoice) return;
  await configureItem(itemChoice);
}

async function configureItem(item) {
  const spinner = ora(`Loading ${item.name} options…`).start();
  let detail;
  try {
    detail = await browser.getItemDetail(item.id);
    spinner.succeed('Item loaded');
  } catch (e) {
    spinner.fail('Failed to load item: ' + e.message);
    return;
  }

  renderItem(detail);

  const selections = {};

  for (const group of detail.optionGroups || []) {
    if (!group.options.length) continue;

    const label = chalk.cyan(group.name) +
      (group.required ? chalk.red(' (required)') : chalk.grey(' (optional)'));

    if (group.inputType === 'select' || group.maxSelect === 1) {

      const choices = group.options.map(o => ({
        name: `${o.name}${o.price ? chalk.green('  +' + o.price) : ''}`,
        value: o,
      }));

      if (!group.required) {
        choices.unshift({ name: chalk.grey('Skip'), value: null });
      }

      const { picked } = await inquirer.prompt([{
        type: 'list',
        name: 'picked',
        message: label,
        choices,
      }]);

      if (picked) selections[group.name] = [{ ...picked, inputType: 'select' }];

    } else {

      const { picked } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'picked',
        message: label,
        choices: group.options.map(o => ({
          name: `${o.name}${o.price ? chalk.green('  +' + o.price) : ''}`,
          value: { ...o, inputType: 'checkbox' },
        })),
      }]);

      if (picked.length) selections[group.name] = picked;
    }
  }

  const { qty } = await inquirer.prompt([{
    type: 'number',
    name: 'qty',
    message: chalk.cyan('Quantity:'),
    default: 1,
    validate: v => (Number.isInteger(v) && v >= 1 && v <= 20) || 'Enter a number between 1 and 20',
  }]);

  console.log();
  console.log(chalk.bold(`  ${qty}x ${item.name}`) + chalk.green(`  ${detail.price}`));
  for (const [grp, opts] of Object.entries(selections)) {
    console.log(chalk.grey(`  ${grp}: `) + opts.map(o => o.name).join(', '));
  }
  console.log();

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: chalk.cyan('Add to basket?'),
    default: true,
  }]);

  if (!confirm) return;

  const addSpinner = ora('Adding to basket…').start();
  try {
    const result = await browser.addToBasket(item.id, selections, qty);
    addSpinner.succeed(chalk.green(`  Added ${qty}x ${item.name} to basket`));
    if (result.basket?.total) {
      console.log(chalk.grey(`  Basket total: `) + chalk.white(result.basket.total));
    }
  } catch (e) {
    addSpinner.fail('Failed to add item: ' + e.message);
  }
}

async function viewBasket() {
  const spinner = ora('Fetching basket…').start();
  let basket;
  try {
    basket = await browser.getBasket();
    spinner.succeed('Basket loaded');
  } catch (e) {
    spinner.fail('Failed to load basket: ' + e.message);
    return;
  }

  renderBasket(basket);

  if (!basket.items?.length) return;

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: chalk.cyan('Basket options:'),
    choices: [
      { name: '  Remove an item', value: 'remove' },
      { name: '  Proceed to checkout', value: 'checkout' },
      { name: chalk.grey('← Back'), value: 'back' },
    ],
  }]);

  if (action === 'checkout') await goCheckout();
  if (action === 'remove') await removeFromBasket(basket);
}

async function removeFromBasket(basket) {
  const { item } = await inquirer.prompt([{
    type: 'list',
    name: 'item',
    message: chalk.cyan('Which item to remove?'),
    choices: basket.items.map(i => ({ name: `${i.qty}x ${i.name}  ${chalk.green(i.lineTotal)}`, value: i })),
  }]);

  const spinner = ora(`Removing ${item.name}…`).start();
  try {
    await browser.removeFromBasket(item.basketId);
    spinner.succeed(chalk.yellow(`Removed ${item.name} from basket`));
  } catch (e) {
    spinner.fail('Failed: ' + e.message);
  }
}

async function goCheckout() {
  console.log();
  console.log(chalk.yellow('    Opening checkout…'));
  console.log(chalk.grey('  The browser window will appear — fill in your details and submit there.'));
  console.log();

  const spinner = ora('Navigating to checkout…').start();
  try {

    await browser.showWindow();
    await browser.goToCheckout();
    spinner.succeed('Checkout is open in the browser window');

    const { prefill } = await inquirer.prompt([{
      type: 'confirm',
      name: 'prefill',
      message: chalk.cyan('Pre-fill your details from here?'),
      default: true,
    }]);

    if (prefill) await collectAndFillCheckout();

    console.log(chalk.green('\n    Review your order in the browser and click "Continue to Payment".'));
    console.log(chalk.grey('  Come back here after your order is placed.\n'));
  } catch (e) {
    spinner.fail('Checkout error: ' + e.message);
  }
}

async function collectAndFillCheckout() {
  const answers = await inquirer.prompt([
    { type: 'input', name: 'firstName',    message: 'First name:',      validate: v => !!v.trim() },
    { type: 'input', name: 'lastName',     message: 'Last name:',       validate: v => !!v.trim() },
    { type: 'input', name: 'addressLine1', message: 'Address line 1:',  validate: v => !!v.trim() },
    { type: 'input', name: 'addressLine2', message: 'Address line 2 (optional):' },
    { type: 'input', name: 'town',         message: 'Town:',            validate: v => !!v.trim() },
    { type: 'input', name: 'postcode',     message: 'Postcode:',        validate: v => v.trim().length >= 5 },
    { type: 'input', name: 'telephone',    message: 'Phone number:',    validate: v => !!v.trim() },
    { type: 'input', name: 'email',        message: 'Email:',           validate: v => v.includes('@') },
  ]);

  const spinner = ora('Filling checkout form…').start();
  try {
    await browser.fillCheckout(answers);
    spinner.succeed('Form filled — review in browser and submit when ready');
  } catch (e) {
    spinner.fail('Auto-fill failed: ' + e.message);
  }
}

main().catch(e => {
  console.error(chalk.red('Fatal error: ' + e.message));
  process.exit(1);
});