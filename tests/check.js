module.exports = function (name) {
  let fails = 0;
  return {
    ok(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + name + ': ' + msg); if (!cond) fails++; },
    done() { console.log(fails ? `${name}: ${fails} FAILED` : `${name}: ALL PASSED`); process.exit(fails ? 1 : 0); }
  };
};
