/** Real program exceeding both previous 2 MiB section limits. No binary padding. */
export function largeAOTProject() {
  const count=16000, size=800000;
  return {schema:1,name:'NativeLargeAOT',startup:'Sub Main',modules:[{
    name:'MainModule',kind:'module',code:[
      'Public Sub Main()', 'Dim total As Long',
      ...Array.from({length:count},()=> 'total = total + 1'),
      `Debug.Assert total = ${count}`,
      ...['x','y','z'].map(c=>`Debug.Assert Len("${c.repeat(size)}") = ${size}`),
      'Debug.Print "NATIVE_LARGE_AOT_OK"', 'End Sub'
    ].join('\n')
  }]};
}
