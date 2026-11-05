const teeth = [
    { number: 16, status: 'decayed'},
    { number: 15, status: 'healthy'},
    { number: 14, status: 'healthy'},
]

class Chart {
  constructor(teeth) {
    this.teeth = teeth;
  }

  count() {
    return this.teeth.length;
  }
}

console.log(new Chart(teeth).count());