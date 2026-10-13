import { describe, expect, it } from 'vitest'
import { evaluateExpression } from './expression'

describe('expression evaluator', () => {
  it.each([
    ['1 + 2*3', '7'],
    ['(sqrt(50)*sin(30°))/25.3', '0.139744423159'],
    ['sin(30°)', '0.5'],
    ['cos(0)', '1'],
    ['tan(-0.5)', '-0.546302489844'],
    ['2^3^2', '512'],
    ['-2^2', '-4'],
    ['sqrt(+9)', '3'],
    ['1 / 3', '0.333333333333']
  ])('evaluates %s', (source, result) => {
    expect(evaluateExpression(source)).toBe(result)
  })

  it.each([
    '', 'hello', '1 +', 'sqrt()', 'sqrt(-1)', '1/0', '2 2', 'sin 1',
    'Math.sin(1)', 'alert(1)', '1°', '2**3', '(1+2', '1=2', '9'.repeat(300)
  ])('rejects malformed or unrelated input: %s', source => {
    expect(evaluateExpression(source)).toBeNull()
  })
})
