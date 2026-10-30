const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../inventory/data.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(`${source}\nglobalThis.inventoryData = { PRODUCT_KEYS, PROVINCES_DATA, REGION_TOTALS };`, context);
const { PRODUCT_KEYS, PROVINCES_DATA, REGION_TOTALS } = context.inventoryData;

assert.equal(Object.keys(PROVINCES_DATA).length, 40);
assert.equal(Object.keys(REGION_TOTALS).length, 3);
for (const item of [...Object.values(PROVINCES_DATA), ...Object.values(REGION_TOTALS)]) {
  for (const level of ['thap', 'tb', 'cao']) {
    for (const key of PRODUCT_KEYS) {
      assert.equal(typeof item.quotas[level][key], 'number', `${item.name || item.label} / ${level} / ${key}`);
      assert.ok(item.quotas[level][key] >= 0, `${item.name || item.label} / ${level} / ${key}`);
    }
  }
}

// Checked against the matching product headers in each level's source sheet.
const expected = {
  'An Giang': {
    thap: [960000, 30200, 30200, 30000],
    tb: [1230000, 40770, 40770, 40500],
    cao: [1380000, 50132, 50132, 49800],
  },
  'Cần Thơ': {
    thap: [470000, 18200, 18200, 15000],
    tb: [600000, 24570, 24570, 20250],
    cao: [680000, 30212, 30212, 24900],
  },
};
for (const [province, levels] of Object.entries(expected)) {
  for (const [level, values] of Object.entries(levels)) {
    assert.deepEqual(
      ['thep_xay_dung', 'thep_v_den', 'thep_v_kem', 'day_3mm'].map(key => PROVINCES_DATA[province].quotas[level][key]),
      values,
      `${province} / ${level}`,
    );
  }
}
assert.equal(REGION_TOTALS.mien_nam.quotas.tb.thep_xay_dung, 4100000);
assert.equal(REGION_TOTALS.mien_nam.quotas.cao.thep_xay_dung, 4600000);
console.log('Inventory quota checks passed.');
