import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';

const BASE_URL = 'https://www.order.gdk.com';
const TAKEAWAY = `${BASE_URL}/takeaway`;

export class GDKBrowser {
  constructor() {
    this._browser = null;
    this._ctx = null;
    this._page = null;
  }

  async launch({ headless = process.env.HEADED !== '1' } = {}) {
    this._browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1280,720',
      ],
    });

    this._ctx = await this._browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-GB',
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      javaScriptEnabled: true,

      extraHTTPHeaders: {
        'Accept-Language': 'en-GB,en;q=0.9',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });

    await this._ctx.addInitScript(() => {

      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

      Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en'] });

      window.chrome = { runtime: {} };

      const origQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(params);
    });

    this._page = await this._ctx.newPage();
  }

  async close() {
    if (this._browser) await this._browser.close();
    if (this._headedBrowser) await this._headedBrowser.close();
  }

  
  async showWindow() {
    if (this._headedBrowser) return;

    const cookies = await this._ctx.cookies();

    this._headedBrowser = await chromium.launch({ headless: false });
    this._headedCtx  = await this._headedBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                 '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-GB',
      viewport: { width: 1280, height: 720 },
    });

    await this._headedCtx.addCookies(cookies);
    this._headedPage = await this._headedCtx.newPage();

    this._useHeadedPage = true;
  }

  get page() {
    if (!this._page) throw new Error('Browser not launched');
    return this._page;
  }

  
  async waitFor(selector, timeout = 8000) {
    return this.page.waitForSelector(selector, { timeout });
  }

  
  async _cookieHeader() {
    const cookies = await this._ctx.cookies(BASE_URL);
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  
  async _apiGet(url) {
    const cookieHeader = await this._cookieHeader();
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        Cookie: cookieHeader,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: TAKEAWAY + '/',
      },
    });
    return data;
  }

  
  async setCountryUK() {
    await this.page.goto(TAKEAWAY + '/', { waitUntil: 'domcontentloaded' });

    try {
      const link = this.page.locator('a.country-select-link', { hasText: 'UK' });
      await link.click({ timeout: 4000 });
    } catch {

      await this._ctx.addCookies([{
        name:   'country',
        value:  'uk---GDK---c97c1d19c6---GDK---UK---GDK---1',
        domain: 'www.order.gdk.com',
        path:   '/',
      }]);
    }
  }

  
  async searchStores(postcode) {

    await this.page.goto(TAKEAWAY + '/', { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle').catch(() => {});

    await this.page.fill('#postcode', postcode.trim());

    const responsePromise = this.page.waitForResponse(
      res => res.url().includes('stores.php') && res.status() === 200,
      { timeout: 15000 },
    );

    await this.page.click(
      'button.postcode_search, button.store_search, button[name="postcode"][type="sumbit"], button[name="postcode"]',
    );

    let storeHtml = null;
    try {
      const response = await responsePromise;
      storeHtml = await response.text();
    } catch {

      await this.page.waitForSelector('.storeInfo', { timeout: 10000 }).catch(() => {});
      storeHtml = await this.page.content();
    }

    const stores = this._parseStoreList(storeHtml);

    if (!stores.length) {
      return this._parseStoreList(await this.page.content());
    }

    return stores;
  }

  _parseStoreList(rawResponse) {

    let html = rawResponse;
    if (typeof rawResponse === 'string' && rawResponse.trimStart().startsWith('{')) {
      try {
        const json = JSON.parse(rawResponse);
        html = json.store_list_html || json.html || json.stores || rawResponse;
      } catch {

      }
    }

    const $ = cheerio.load(html);
    const stores = [];

    $('.storeItem').each((_, el) => {
      const $el = $(el);

      const id =
        $el.attr('data-id') ||
        $el.find('[data-id]').first().attr('data-id');

      const name = (
        $el.find('.storeTitle').text() ||
        $el.find('.storeInfoTitle').text()
      ).replace(/\s+/g, ' ').trim();

      const address =
        $el.find('.storeAddress, .address').text().trim();

      const distance =
        $el.find('.storeInfoDistance').text().trim();

      const closed =
        $el.hasClass('closed') ||
        $el.find('.storeStatus.closed').length > 0;

      if (name) stores.push({ id, name, address, distance, isOpen: !closed });
    });

    return stores;
  }

  async selectStore(storeId, storeName) {

    if (storeId) {

      const storeClicked = await this.page.evaluate((id) => {

        const byDataId = document.querySelector(`[data-id="${id}"] .storeButton, [data-id="${id}"] a, .storeItem[data-id="${id}"]`);
        if (byDataId) { byDataId.click(); return true; }

        const byHref = document.querySelector(`a[href*="store_id=${id}"], a[href*="id=${id}"]`);
        if (byHref) { byHref.click(); return true; }
        return false;
      }, storeId);

      if (storeClicked) {
        await this.page.waitForLoadState('networkidle').catch(() => {});
        await this.page.waitForTimeout(1000);
      } else {

        const storeUrl = `${TAKEAWAY}/selectstore.php?store_id=${storeId}`;
        await this.page.goto(storeUrl, { waitUntil: 'networkidle' }).catch(() => {});

        await this._ctx.addCookies([{
          name:   'store_id',
          value:  String(storeId),
          domain: 'www.order.gdk.com',
          path:   '/',
        }]);
      }
    }

    await this.page.goto(`${TAKEAWAY}/category_grid.php`, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(1000);
  }

  
  async getCategories() {

    await this.page.goto(`${TAKEAWAY}/category_grid.php`, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(2000);

    let html = await this.page.content();
    let cats = this._parseCategories(html);
    if (cats.length) return cats;

    const overlayLink = this.page.locator('#selectstore_link, a.storeoverlay');
    if (await overlayLink.count() > 0) {
      await overlayLink.click().catch(() => {});
      await this.page.waitForTimeout(1000);
      await this.page.goBack().catch(() => {});
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.page.waitForTimeout(2000);
      html = await this.page.content();
      cats = this._parseCategories(html);
      if (cats.length) return cats;
    }

    await this.page.goto(`${TAKEAWAY}/selectstore.php`, { waitUntil: 'networkidle' }).catch(() => {});
    await this.page.goto(`${TAKEAWAY}/category_grid.php`, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(3000);
    html = await this.page.content();
    return this._parseCategories(html);
  }

  _parseCategories(html) {
    const $ = cheerio.load(html);
    const cats = [];
    const seen = new Set();

    const selectors = [
      '.categoryGridItems a[href*="category"]',
      '.menuItem.categoryMenuItem a[href*="category"]',
      '.categoryMenuItem a[href*="category"]',
      'a[href*="category_grid.php?category"]',
    ];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const $a   = $(el);
        const href = $a.attr('href') || '';
        const match = href.match(/category=(\d+)/);
        const id = match ? match[1] : null;
        if (!id || seen.has(id)) return;

        const name = ($a.find('h4').text() || $a.find('h3').text() || $a.text())
          .replace(/\s+/g, ' ').trim();
        const img = $a.find('img').first().attr('src') || '';

        if (name && id) {
          seen.add(id);
          cats.push({ id, name, href, imageUrl: img });
        }
      });
      if (cats.length) break;
    }

    if (!cats.length) {
      const known = [
        { id: '646002', name: 'Special Offers' },
        { id: '646008', name: 'Plant Based' },
        { id: '646006', name: 'Mains' },
        { id: '646003', name: 'Boss Box' },
        { id: '646007', name: 'Doner Boxes & Bowls' },
        { id: '646107', name: 'FIV£R' },
        { id: '646009', name: 'Kids' },
        { id: '646001', name: 'Sides & Fries' },
        { id: '645999', name: 'Sauces' },
        { id: '646000', name: 'Soft Drinks' },
      ];
      known.forEach(c => cats.push({
        ...c,
        href: `/takeaway/category_grid.php?category=${c.id}`,
        imageUrl: '',
      }));
    }

    return cats;
  }

  
  async getCategoryItems(categoryId) {
    const url = `${TAKEAWAY}/category_grid.php?category=${categoryId}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    const html = await this.page.content();
    return this._parseItems(html);
  }

  _parseItems(html) {
    const $ = cheerio.load(html);
    const items = [];

    $('.menuItem.productMenuItem').each((_, el) => {
      const $el = $(el);
      const id  = $el.attr('data-id');
      const name = $el.find('.itemName strong').text().trim()
                || $el.find('strong').first().text().trim();
      const price = $el.find('.itemPrice').text().replace(/\s+/g, ' ').trim();
      const calories = $el.find('.calories').text().trim();
      const imageUrl = $el.find('img').first().attr('src') || '';

      if (id && name) items.push({ id, name, price, calories, imageUrl });
    });

    return items;
  }

  
  async getItemDetail(itemId) {
    const url = `${TAKEAWAY}/item.php?id=${itemId}&ajax=1`;
    await this.page.goto(url, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(800);
    const html = await this.page.content();
    const detail = this._parseItemDetail(html, itemId);

    if (!detail.optionGroups.length) {
      const snapshot = await this.page.evaluate(() => {
        const out = {};
        out.selects  = Array.from(document.querySelectorAll('select')).map(s => ({
          name: s.name, id: s.id, class: s.className,
          options: Array.from(s.options).slice(0,4).map(o => ({ val: o.value, text: o.text })),
        }));
        out.checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).slice(0,6).map(c => ({
          name: c.name, id: c.id, class: c.className,
        }));

        const classes = new Set();
        document.querySelectorAll('select, input').forEach(el => {
          let node = el;
          for (let i = 0; i < 4; i++) {
            node = node?.parentElement;
            (node?.className || '').split(' ').filter(Boolean).forEach(c => classes.add(c));
          }
        });
        out.nearbyClasses = [...classes].sort();
        return out;
      });
      console.error('[DEBUG] No option groups parsed. Page snapshot:');
      console.error(JSON.stringify(snapshot, null, 2));
    }

    return detail;
  }

  _parseItemDetail(html, itemId) {
    const $ = cheerio.load(html);

    const name = (
      $('h1').first().text() ||
      $('.complexItemTitle, .itemTitle').first().text()
    ).replace(/\s+/g, ' ').trim();

    const description = (
      $('.complexItemDescription, .itemDescription').first().text()
    ).replace(/\s+/g, ' ').trim();

    const price    = $('.itemPrice, .price').first().text().replace(/\s+/g, ' ').trim();
    const calories = $('.calories').first().text().replace(/\s+/g, ' ').trim();
    const optionGroups = [];

    $('select').each((_, sel) => {
      const $sel      = $(sel);
      const inputName = $sel.attr('name') || '';
      const isRequired = !!$sel.attr('required') ||
        $sel.attr('data-validation') === 'required';

      let grpName = '';
      const $wrap = $sel.closest('div, fieldset, .itemOption');

      grpName = $wrap.find('h3, h4').first().text().trim();

      if (!grpName) {
        $wrap.prevAll('h3, h4').each((_, h) => { if (!grpName) grpName = $(h).text().trim(); });
      }

      if (!grpName) {
        $sel.prevAll('h3, h4, label').each((_, h) => { if (!grpName) grpName = $(h).text().trim(); });
      }
      grpName = grpName.replace(/\s+/g, ' ').trim() || inputName;

      const options = [];
      $sel.find('option').each((_, opt) => {
        const $opt = $(opt);
        const val  = ($opt.attr('value') || '').trim();
        if (!val || val === '0') return;

        const rawLabel = $opt.text().replace(/\s+/g, ' ').trim();
        const priceMatch = rawLabel.match(/[+]?£[\d.]+/);
        const optPrice   = priceMatch ? priceMatch[0] : '';
        const cleanLabel = rawLabel.replace(/\s*[+]?£[\d.]+\s*$/, '').trim();
        options.push({ id: val, name: cleanLabel, price: optPrice, inputName });
      });

      if (options.length) {
        optionGroups.push({
          name: grpName,
          required: isRequired,
          maxSelect: 1,
          inputType: 'select',
          inputName,
          options,
        });
      }
    });

    const cbGroups = {};
    $('input[type="checkbox"]').each((_, inp) => {
      const $inp    = $(inp);
      const id      = $inp.attr('name') || $inp.attr('id') || $inp.val() || '';
      const $wrap   = $inp.closest('.itemOption, .complexOption, fieldset, .row, div');
      const grpKey  = $wrap.attr('class') || $wrap.attr('id') || 'toppings';
      const grpName = (
        $wrap.find('h3, h4, .optionTitle').first().text() ||
        $wrap.prev('h3, h4').text()
      ).replace(/\s+/g, ' ').trim() || 'Extras';

      const $label  = $(`label[for="${$inp.attr('id')}"]`);

      const rawLabel = ($label.length ? $label.text() : $inp.parent().text())
        .replace(/\s+/g, ' ').trim();
      if (!rawLabel || !id) return;

      const priceMatch = rawLabel.match(/[+]?£[\d.]+/);
      const optPrice   = priceMatch ? priceMatch[0] : '';

      if (!cbGroups[grpKey]) cbGroups[grpKey] = { name: grpName, options: [] };
      cbGroups[grpKey].options.push({ id, name: rawLabel, price: optPrice, inputName: id });
    });

    for (const grp of Object.values(cbGroups)) {
      if (grp.options.length) {
        optionGroups.push({
          name: grp.name,
          required: false,
          maxSelect: 99,
          inputType: 'checkbox',
          options: grp.options,
        });
      }
    }

    return { id: itemId, name, description, price, calories, optionGroups };
  }

  
  async addToBasket(itemId, selections = {}, qty = 1) {

    const url = `${TAKEAWAY}/item.php?id=${itemId}`;
    await this.page.goto(url, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(500);

    for (const opts of Object.values(selections)) {
      for (const opt of opts) {
        if (!opt.inputName || !opt.id) continue;
        try {
          if (opt.inputType === 'select') {
            await this.page.selectOption(`select[name="${opt.inputName}"]`, String(opt.id));
          } else {
            const cb = this.page.locator(
              `input[type="checkbox"][name="${opt.inputName}"], input[type="checkbox"][id="${opt.inputName}"]`
            ).first();
            if (await cb.count() > 0) await cb.check({ force: true });
          }
        } catch { /* skip */ }
      }
    }

    try {
      const qtyInput = this.page.locator('input[name="qty"], input#qty').first();
      if (await qtyInput.count() > 0) await qtyInput.fill(String(qty));
    } catch { /* no qty field */ }

    const result = await this.page.evaluate(async (qtyVal) => {
      const form = document.querySelector('form');
      if (!form) return { ok: false, error: 'no form' };

      const params = new URLSearchParams();
      new FormData(form).forEach((v, k) => params.append(k, v));
      params.set('quantity', String(qtyVal));
      params.set('ajax', '1');

      try {
        const resp = await fetch('/takeaway/basket.php', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                     'X-Requested-With': 'XMLHttpRequest' },
          body: params.toString(),
        });
        const json = await resp.json();
        return { ok: true, json };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, qty);

    let basketData = { items: [], total: '' };

    if (result.ok && result.json) {
      const json = result.json;

      if (json.basket?.lines?.length) {
        basketData.items = json.basket.lines.map(l => ({
          basketId:  l.id || '',
          name:      l.shortDescription || l.description || l.name || '',
          qty:       l.quantity || 1,
          lineTotal: `£${parseFloat(l.linePrice || l.unitPrice || 0).toFixed(2)}`,
        }));
        basketData.subtotal = json.basket.subtotal ? `£${parseFloat(json.basket.subtotal).toFixed(2)}` : '';
        basketData.total    = json.basket.total    ? `£${parseFloat(json.basket.total).toFixed(2)}`    : '';
      } else if (json.minibasket_html) {
        const $m = cheerio.load(json.minibasket_html);
        basketData.total = $m('.costOfBasketItems').text().trim();
      }
    }

    return { action: 'added', itemId, qty, basket: basketData };
  }

  async removeFromBasket(basketItemId) {
    const url = `${TAKEAWAY}/ajax/basket.php?action=remove&id=${basketItemId}&ajax=1`;
    const result = await this._apiGet(url);
    return result;
  }

  
  async getBasket() {

    const result = await this.page.evaluate(async () => {
      try {
        const resp = await fetch('/takeaway/basket.php', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                     'X-Requested-With': 'XMLHttpRequest' },
          body: 'action=view&ajax=1',
        });
        const json = await resp.json();
        return { ok: true, json };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    if (result.ok && result.json?.basket?.lines) {
      const json = result.json;
      const items = (json.basket.lines || []).map(l => ({
        basketId:  l.id || l.lineId || '',
        name:      l.shortDescription || l.description || l.name || '',
        qty:       l.quantity || 1,
        lineTotal: `£${parseFloat(l.linePrice || l.unitPrice || 0).toFixed(2)}`,
      }));
      return {
        items,
        subtotal:    json.basket.subtotal    ? `£${parseFloat(json.basket.subtotal).toFixed(2)}`    : '',
        deliveryFee: json.basket.delivery    ? `£${parseFloat(json.basket.delivery).toFixed(2)}`    : '',
        total:       json.basket.total       ? `£${parseFloat(json.basket.total).toFixed(2)}`       : '',
      };
    }

    const miniHtml = await this.page.evaluate(() => {
      const el = document.querySelector('#minibasket_html');
      return el ? el.innerHTML : '';
    });
    if (miniHtml) {
      const $m = cheerio.load(miniHtml);
      const total = $m('.costOfBasketItems').text().trim();
      return { items: [], subtotal: '', deliveryFee: '', total };
    }

    return { items: [], subtotal: '', deliveryFee: '', total: '' };
  }

  _parseBasket(html) {
    const $ = cheerio.load(html);
    const items = [];

    const lineSelectors = [
      '.basketItem', '.orderItem', '.lineItem', '.basketLine',
      '.order_item', '.basket_item', 'tr.item', '.itemRow',
      '[class*="Line"]:has(.price)', '[class*="item"]:has(strong)',
    ];

    for (const sel of lineSelectors) {
      try {
        $(sel).each((_, el) => {
          const $el = $(el);
          const name = (
            $el.find('.itemDescription, .description, .itemName, .name, strong, td').first().text()
          ).replace(/\s+/g, ' ').trim();
          if (!name || name.length < 2) return;

          const qty = parseInt($el.find('.qty, .quantity').text().trim() || '1', 10);
          const lineTotal = $el.find('.price, .lineTotal, .itemPrice').last().text().trim();
          const basketId  = $el.attr('data-id') || $el.attr('data-line') ||
                            $el.find('[data-id]').first().attr('data-id') || '';
          items.push({ basketId, name, qty: isNaN(qty) ? 1 : qty, lineTotal });
        });
      } catch { /* invalid selector, skip */ }
      if (items.length) break;
    }

    const subtotal    = $('.subTotal, .subtotal').last().text().trim();
    const deliveryFee = $('.deliveryCharge, .delivery').last().text().trim();
    const total       = $('.totalPrice, .basketTotal, .costOfBasketItems, .total').last().text().trim();

    return { items, subtotal, deliveryFee, total };
  }

  async goToCheckout() {
    const pg = this._useHeadedPage ? this._headedPage : this.page;

    await pg.goto(`${TAKEAWAY}/basket.php`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1000);

    const selectors = [
      'a[href="billing_details.php"]',
      'a[href*="billing_details"]',
      'a.checkoutTrigger',
      'a.js_checkoutTrigger',
      'a.button:has-text("checkout")',
      'a.button:has-text("Checkout")',
      'button:has-text("checkout")',
    ];

    let clicked = false;
    for (const sel of selectors) {
      const el = pg.locator(sel).first();
      if (await el.count() > 0) {
        await el.click();
        clicked = true;
        break;
      }
    }

    await pg.waitForLoadState('networkidle').catch(() => {});
    await pg.waitForTimeout(500);
  }

  
  async fillCheckout(details) {
    const pg = this._useHeadedPage ? this._headedPage : this.page;

    const fill = async (selector, value) => {
      if (!value) return;
      try { await pg.fill(selector, value); } catch { /* field not present */ }
    };

    await fill('#firstName',    details.firstName);
    await fill('#lastName',     details.lastName);
    await fill('#addressLine1', details.addressLine1);
    await fill('#addressLine2', details.addressLine2 || '');
    await fill('#town',         details.town);
    await fill('#postcode',     details.postcode);
    await fill('#telephone',    details.telephone);
    await fill('#email',        details.email);
  }
}
