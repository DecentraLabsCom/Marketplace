import { buildDirectFmuDescribeUrl } from '../describeUrl'

describe('buildDirectFmuDescribeUrl', () => {
  test('builds a browser-side FMU describe URL from an access URI', () => {
    expect(buildDirectFmuDescribeUrl('https://gateway.example/fmu', 'Bouncing Ball.fmu'))
      .toBe('https://gateway.example/fmu/api/v1/simulations/describe?fmuFileName=Bouncing+Ball.fmu')
  })

  test('rejects URLs containing credentials, query strings or fragments', () => {
    expect(() => buildDirectFmuDescribeUrl('https://user:pass@gateway.example/fmu', 'model.fmu'))
      .toThrow(/invalid gateway/i)
    expect(() => buildDirectFmuDescribeUrl('https://gateway.example/fmu?next=internal', 'model.fmu'))
      .toThrow(/invalid gateway/i)
    expect(() => buildDirectFmuDescribeUrl('https://gateway.example/fmu#fragment', 'model.fmu'))
      .toThrow(/invalid gateway/i)
  })
})
