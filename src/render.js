import chalk from 'chalk';

const LINE = chalk.grey('─'.repeat(60));
const DLINE = chalk.grey('═'.repeat(60));



export function renderHeader() {
  console.clear();
  const art = [
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@%%###%%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@%*+===========+*#@@@@%+============+++**%@@@@%+======#@@@@@%*+=======+#%#%@@@@@@@@@@',
    '@@@@@@@@@@@@@@*+==================+%@%=========++=++=====+*%@%+======*@@@%*========+#@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@%+========+++++=========*#=========+*+++=======+##+======*%%+========+#@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@%=======+#@@@@@@@%+====++**========+*##*+=========*+======++========*%@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@+======+@@@@@@@@@@@##@@@@@%=======#@@@@%#*========================+%@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@%=======#@@@@@@+===================*@@@@@@*=========================+%@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@%=======*@@@@@@+===================+#@@@@#============================#@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@+======+@@@@@@+=====================*@@*===================*%*+=======*@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@#=======+*%@@@@@@%*======++==========+*===========++======*@@@%+=======+%@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@#==========++++=========*#==========++=========+##+======*@@@@%+=======+#@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@%*===================+#@%===================+*%@%+======*@@@@@@*========*@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@#*+===========++*%@@@%+===++++++++++++**%@@@@%*=====+#@@@@@@@#++++++==+%@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@%%%%%%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  ];
  art.forEach(line => console.log(chalk.hex('#FF7A00')(line)));
  console.log();
  console.log(chalk.bold.white('  GERMAN DONER KEBAB') + chalk.grey(' — Terminal Edition'));
  console.log(chalk.grey('  CLI made by Huzayl, powered by playwright'));
  console.log();
}



export function renderStores(stores) {
  console.log();
  console.log(LINE);
  console.log(chalk.bold.yellow('   Nearby Stores'));
  console.log(LINE);

  stores.forEach((s, i) => {
    const status = s.isOpen !== false
      ? chalk.green(' OPEN')
      : chalk.red(' CLOSED');

    console.log(
      chalk.bold.white(`  ${i + 1}. ${s.name}`) +
      '  ' + status,
    );
    if (s.address)  console.log(chalk.grey(`     ${s.address}`));
    if (s.distance) console.log(chalk.grey(`     ${s.distance} away`));
    console.log();
  });

  console.log(LINE);
  console.log();
}


export function renderMenu(categories) {
  console.log();
  console.log(LINE);
  console.log(chalk.bold.yellow('    Menu Categories'));
  console.log(LINE);

  const cols = 3;
  for (let i = 0; i < categories.length; i += cols) {
    const row = categories.slice(i, i + cols);
    const line = row
      .map(c => chalk.cyan(`  [${c.id}] `) + chalk.white(c.name.padEnd(24)))
      .join('');
    console.log(line);
  }

  console.log(LINE);
  console.log();
}



export function renderItem(item) {
  console.log();
  console.log(LINE);
  console.log(chalk.bold.white(`    ${item.name}`));
  if (item.price)       console.log(chalk.green(`    ${item.price}`));
  if (item.calories)    console.log(chalk.grey(`    ${item.calories}`));
  if (item.description) console.log(chalk.grey(`     ${item.description}`));
  console.log(LINE);

  if (item.optionGroups?.length) {
    console.log(chalk.bold.yellow('  Customisation options:'));
    item.optionGroups.forEach(grp => {
      console.log(chalk.bold(`\n  ${grp.name}${grp.required ? chalk.red(' *') : ''}:`));
      grp.options.forEach(o => {
        const priceStr = o.price ? chalk.green(` +${o.price}`) : '';
        console.log(`    • ${o.name}${priceStr}`);
      });
    });
    console.log();
  }

  console.log(LINE);
  console.log();
}



export function renderBasket(basket) {
  console.log();
  console.log(LINE);
  console.log(chalk.bold.yellow('   Your Basket'));
  console.log(LINE);

  if (!basket.items?.length) {
    console.log(chalk.grey('  Your basket is empty.'));
    console.log(LINE);
    console.log();
    return;
  }

  basket.items.forEach(item => {
    console.log(
      chalk.white(`  ${item.qty}x ${item.name}`.padEnd(44)) +
      chalk.green(item.lineTotal),
    );
  });

  console.log(LINE);

  if (basket.subtotal)    console.log(chalk.grey('  Subtotal:  ') + chalk.white(basket.subtotal));
  if (basket.deliveryFee) console.log(chalk.grey('  Delivery:  ') + chalk.white(basket.deliveryFee));
  if (basket.total)       console.log(chalk.bold('  Total:     ') + chalk.bold.green(basket.total));

  console.log(LINE);
  console.log();
}



export function renderJSON(label, data) {
  console.log();
  console.log(chalk.bold.cyan(`    ${label}`));
  console.log(chalk.grey(JSON.stringify(data, null, 2)));
  console.log();
}
