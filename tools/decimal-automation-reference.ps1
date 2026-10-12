param(
    [string]$InputPath = 'reports/decimal/automation-input.json',
    [string]$OutputPath = 'reports/decimal/automation-output.json'
)
$ErrorActionPreference = 'Stop'
# This invokes Windows Automation itself. It is not a Microsoft VB6 compiler
# execution and must never be described as full VB6 differential certification.
Add-Type -TypeDefinition @'
using System;
using System.Globalization;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Explicit, Size = 16)]
public struct AutomationDecimal {
    [FieldOffset(0)] public ushort Reserved;
    [FieldOffset(2)] public byte Scale;
    [FieldOffset(3)] public byte Sign;
    [FieldOffset(4)] public uint High;
    [FieldOffset(8)] public ulong Low;
    public static AutomationDecimal Parse(string text) {
        decimal value = decimal.Parse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
        int[] bits = decimal.GetBits(value);
        return new AutomationDecimal {
            Scale = (byte)((bits[3] >> 16) & 255), Sign = (byte)(bits[3] < 0 ? 128 : 0),
            High = unchecked((uint)bits[2]), Low = ((ulong)unchecked((uint)bits[1]) << 32) | unchecked((uint)bits[0])
        };
    }
    public string Text() {
        if (Scale > 28 || (Sign != 0 && Sign != 128)) throw new InvalidOperationException("Invalid native DECIMAL payload");
        return new decimal(unchecked((int)(uint)Low), unchecked((int)(uint)(Low >> 32)), unchecked((int)High), Sign != 0, Scale).ToString(CultureInfo.InvariantCulture);
    }
}
public sealed class DecimalReferenceResult {
    public int HResult;
    public string Value;
}
public static class DecimalAutomationReference {
    [DllImport("oleaut32.dll", ExactSpelling = true)] private static extern int VarDecAdd(ref AutomationDecimal left, ref AutomationDecimal right, out AutomationDecimal result);
    [DllImport("oleaut32.dll", ExactSpelling = true)] private static extern int VarDecSub(ref AutomationDecimal left, ref AutomationDecimal right, out AutomationDecimal result);
    [DllImport("oleaut32.dll", ExactSpelling = true)] private static extern int VarDecMul(ref AutomationDecimal left, ref AutomationDecimal right, out AutomationDecimal result);
    [DllImport("oleaut32.dll", ExactSpelling = true)] private static extern int VarDecDiv(ref AutomationDecimal left, ref AutomationDecimal right, out AutomationDecimal result);
    [DllImport("oleaut32.dll", ExactSpelling = true)] private static extern int VarDecCmp(ref AutomationDecimal left, ref AutomationDecimal right);
    public static DecimalReferenceResult Run(string operation, string a, string b) {
        var left = AutomationDecimal.Parse(a); var right = AutomationDecimal.Parse(b);
        AutomationDecimal result; int status;
        switch (operation) {
            case "add": status = VarDecAdd(ref left, ref right, out result); break;
            case "subtract": status = VarDecSub(ref left, ref right, out result); break;
            case "multiply": status = VarDecMul(ref left, ref right, out result); break;
            case "divide": status = VarDecDiv(ref left, ref right, out result); break;
            case "compare":
                status = VarDecCmp(ref left, ref right);
                if (status < 0 || status > 2) return new DecimalReferenceResult { HResult = status };
                return new DecimalReferenceResult { HResult = 0, Value = (status - 1).ToString(CultureInfo.InvariantCulture) };
            default: throw new ArgumentException("Unsupported Decimal reference operation", "operation");
        }
        return new DecimalReferenceResult { HResult = status, Value = status == 0 ? result.Text() : null };
    }
}
'@
$cases = @(Get-Content -LiteralPath $InputPath -Raw | ConvertFrom-Json)
$results = @(
    foreach ($case in $cases) {
        $result = [DecimalAutomationReference]::Run($case.operation, $case.left, $case.right)
        [pscustomobject]@{ id = $case.id; hresult = $result.HResult; value = $result.Value }
    }
)
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath), (ConvertTo-Json -InputObject $results -Depth 4), [System.Text.UTF8Encoding]::new($false))
Write-Output ("Executed {0} real OleAut32 calls in a {1}-bit PowerShell process." -f $results.Count, ([IntPtr]::Size * 8))
