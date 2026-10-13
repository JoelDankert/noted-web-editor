const MAX_EXPRESSION_LENGTH = 256
const MAX_OPERATIONS = 128

type Value = { number: number, degrees: boolean }

class Parser {
  private position = 0
  private operations = 0

  constructor(private readonly source: string) {}

  parse(): number | null {
    try {
      const value = this.additive()
      this.space()
      if (this.position !== this.source.length || value.degrees || !Number.isFinite(value.number)) return null
      return value.number
    } catch { return null }
  }

  private step() {
    if (++this.operations > MAX_OPERATIONS) throw new Error('too complex')
  }

  private space() { while (/\s/.test(this.source[this.position] ?? '')) this.position++ }

  private take(token: string): boolean {
    this.space()
    if (!this.source.startsWith(token, this.position)) return false
    this.position += token.length
    return true
  }

  private plain(value: Value): number {
    if (value.degrees) throw new Error('degree outside trig')
    return value.number
  }

  private additive(): Value {
    let left = this.multiplicative()
    while (true) {
      const operator = this.take('+') ? '+' : this.take('-') ? '-' : null
      if (!operator) return left
      this.step()
      const right = this.multiplicative()
      left = { number: operator === '+' ? this.plain(left) + this.plain(right) : this.plain(left) - this.plain(right), degrees: false }
    }
  }

  private multiplicative(): Value {
    let left = this.unary()
    while (true) {
      const operator = this.take('*') ? '*' : this.take('/') ? '/' : null
      if (!operator) return left
      this.step()
      const right = this.unary()
      left = { number: operator === '*' ? this.plain(left) * this.plain(right) : this.plain(left) / this.plain(right), degrees: false }
    }
  }

  private unary(): Value {
    if (this.take('+')) { this.step(); return this.unary() }
    if (this.take('-')) { this.step(); const value = this.unary(); return { number: -this.plain(value), degrees: false } }
    return this.power()
  }

  private power(): Value {
    const left = this.primary()
    if (!this.take('^')) return left
    this.step()
    return { number: this.plain(left) ** this.plain(this.unary()), degrees: false }
  }

  private primary(): Value {
    this.space()
    const functionMatch = /^(sqrt|sin|cos|tan)/.exec(this.source.slice(this.position))
    if (functionMatch) {
      this.position += functionMatch[0].length
      if (!this.take('(')) throw new Error('missing parenthesis')
      const argument = this.additive()
      if (!this.take(')')) throw new Error('missing parenthesis')
      this.step()
      const angle = argument.degrees ? argument.number * Math.PI / 180 : argument.number
      const number = functionMatch[0] === 'sqrt' ? Math.sqrt(this.plain(argument))
        : functionMatch[0] === 'sin' ? Math.sin(angle)
          : functionMatch[0] === 'cos' ? Math.cos(angle) : Math.tan(angle)
      return { number, degrees: false }
    }
    if (this.take('(')) {
      const value = this.additive()
      if (!this.take(')')) throw new Error('missing parenthesis')
      return this.withDegree(value)
    }
    this.space()
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.position))
    if (!match) throw new Error('number expected')
    this.position += match[0].length
    return this.withDegree({ number: Number(match[0]), degrees: false })
  }

  private withDegree(value: Value): Value {
    if (!this.take('°')) return value
    if (value.degrees) throw new Error('duplicate degree')
    return { number: value.number, degrees: true }
  }
}

function formatResult(value: number): string | null {
  if (!Number.isFinite(value)) return null
  const normalized = Math.abs(value) < 1e-14 ? 0 : value
  return Number(normalized.toPrecision(12)).toString()
}

export function evaluateExpression(source: string): string | null {
  if (!source.trim() || source.length > MAX_EXPRESSION_LENGTH) return null
  const value = new Parser(source).parse()
  return value === null ? null : formatResult(value)
}
