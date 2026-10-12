/** Per-instance native Form header. The initial class header is unchanged.
 * IUnknown is embedded (not a numeric pointer masquerading as a COM interface),
 * so Automation VARIANT/Collection copies use ordinary AddRef/Release ownership.
 * Mutable HWND/control/registry state belongs to this allocation, never a module.
 */
export const FORM_INSTANCE=Object.freeze({unknown:16,hwnd:20,phase:24,epoch:28,registry:32,next:60,previous:64,closing:68,font:72,scale:76,bytes:80});
export const FORM_INTERFACE='native:form:iunknown';
