Object.defineProperties(document.documentElement, {
  clientWidth: { configurable: true, get: () => 1280 },
  clientHeight: { configurable: true, get: () => 900 }
})
HTMLElement.prototype.getBoundingClientRect = function () {
  const root = this === document.documentElement || this === document.body
  return new DOMRect(20, 20, root ? 1280 : 400, root ? 900 : this.getAttribute("role") === "dialog" ? 500 : 40)
}
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: {
    configurable: true,
    get() {
      return this.getBoundingClientRect().width
    }
  },
  offsetHeight: {
    configurable: true,
    get() {
      return this.getBoundingClientRect().height
    }
  }
})
