const directoryAccountIds = new Set([
  "cmoc0283w000jjr04200pulk3", // Kimberly Salvoni
  "cmoc059wd000rjr04x03j7h19", // Derek Wolpert
  "cmobzlipg0001lb04a2g895d0", // Anderson Gonzaga
  "cmnq79pc100000bgkadvmrdcd", // Daniel Feleppa
  "cmoivpla80001l804n58rp80b", // Brianna Carbone
  "cmobz2cwb0007k0041qnobqcz", // Stacey Conti
  "cmoc04tlg000pjr04uz7vvcwq", // Shyanna Silva-freeman
]);

export function canAccessOperationsDirectory(id: string | undefined): boolean {
  return !!id && directoryAccountIds.has(id);
}
