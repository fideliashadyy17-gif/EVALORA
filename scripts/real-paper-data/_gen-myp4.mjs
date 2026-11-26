/**
 * One-shot transcriber: turns the production rows captured from Supabase for
 * Melina OUSSOU's MYP4 Version C attempt into `myp4-melina.mjs`.
 *
 * This exists only so the fixture is a verbatim transcription instead of a
 * hand-copied approximation. Run it with `node scripts/real-paper-data/_gen-myp4.mjs`
 * after pasting fresh base64 blobs from `execute_query`.
 */
import { writeFileSync } from "node:fs";

const b64 = (s) => Buffer.from(s, "base64").toString("utf8");

// question id → base64 of the production `prompt`
const PROMPT_B64 = {
  "001001": "V2hpY2ggdmFyaWFibGUgbWVhc3VyZWQgYXQgYSBoZWFsdGggY2xpbmljIGlzICoqcXVhbnRpdGF0aXZlIGNvbnRpbnVvdXMqKj8=",
  "001002":
    "VGhlIHN0ZW0tYW5kLWxlYWYgcGxvdCByZWNvcmRzIDExIHF1aXogc2NvcmVzIChrZXk6IDIgfCA0ID0gMjQpOgoKW0ZpZ3VyZTogUXVpeiBzY29yZXNdCldoYXQgYXJlIHRoZSAqKm1vZGUqKiBhbmQgKiptZWRpYW4qKiBvZiB0aGVzZSBzY29yZXM/",
  "001003":
    "RGFpbHkgcmFpbmZhbGwgKG1tKSBvdmVyIDcgZGF5cyBpbiBQb3J0by1Ob3ZvOiAxMiwgMTgsIDE1LCAyMiwgMTUsIDEwLCAyMC4gVGhlICoqbWVhbioqIGFuZCAqKnJhbmdlKiogYXJlOg==",
  "001004":
    "Qm9sdCBsZW5ndGhzIG1lYXN1cmVkIHRvIHRoZSBuZWFyZXN0IG1pbGxpbWV0cmUgYXJlIGdyb3VwZWQgaW4gdGhlIGNsYXNzIDUw4oCTNTkgbW0uIEl0cyBhY3R1YWwgKipjbGFzcyB3aWR0aCoqIGFuZCAqKm1pZHBvaW50KiogYXJlOg==",
  "001005":
    "VGhlIGhpc3RvZ3JhbSBzaG93cyB3YWl0aW5nIHRpbWVzICR0JCAobWluKSBvZiBjdXN0b21lcnMgYXQgYSBwaGFybWFjeSAoaW50ZXJ2YWxzICRhIFxsZSB0IDwgYiQpLiAqKkhvdyBtYW55IHdhaXRlZCBhdCBsZWFzdCAxMCBtaW51dGVzPyoqCgpbRmlndXJlOiBXYWl0aW5nIHRpbWVzIGF0IGEgcGhhcm1hY3ld",
  "001006":
    "SGVpZ2h0cyAkaCQgKGNtKSBvZiA0MCBzZWVkbGluZ3M6ICQwIFxsZSBoIDwgMTAkICQoZj01KSQsICQxMCBcbGUgaCA8IDIwJCAkKGY9MTIpJCwgJDIwIFxsZSBoIDwgMzAkICQoZj0xNikkLCAkMzAgXGxlIGggPCA0MCQgJChmPTcpJC4gV2hpY2ggc3RhdGVtZW50IGlzIHRydWU/",
  "001007":
    "VGhlIGJveC1hbmQtd2hpc2tlciBwbG90IHN1bW1hcmlzZXMgYmF0dGVyeSBsaWZldGltZXMgKGhvdXJzKToKCltGaWd1cmU6IEJhdHRlcnkgbGlmZXRpbWVzXQpXaGF0IGlzIHRoZSAqKklRUioqLCBhbmQgd2hhdCBwZXJjZW50YWdlIG9mIGJhdHRlcmllcyBsYXN0ZWQgKipsZXNzIHRoYW4gNTAgaG91cnMqKj8=",
  "001008":
    "Rml2ZSBwYXJjZWxzIHdlaWdoIDMsIDQsIDQsIDUsIDYga2cuIEEgc2l4dGggcGFyY2VsIG9mIDI2IGtnIGlzIGFkZGVkLiBIb3cgZG8gdGhlICoqbWVhbioqIGFuZCAqKm1lZGlhbioqIGNoYW5nZT8=",
  "001009":
    "VGhlIHBvcHVsYXRpb24gJFx7MywgNiwgOSwgMTIsIDE1XH0kIGhhcyBtZWFuICRcbXUgPSA5JC4gSXRzIGV4YWN0IHBvcHVsYXRpb24gc3RhbmRhcmQgZGV2aWF0aW9uICRcc2lnbWEkIGlzOg==",
  "001010":
    "Rm9yIHRoZSBjb250aW51b3VzIGNsYXNzICQxNSBcbGUgeCA8IDI1JCwgdGhlIGNsYXNzIHdpZHRoIGlzIDEwIGFuZCB0aGUgbWlkcG9pbnQgaXMgMjA=",
  "001011":
    "SW4gYW4gdW5lcXVhbC13aWR0aCBoaXN0b2dyYW0sIHZlcnRpY2FsIGJhciBoZWlnaHQgcmVwcmVzZW50cyBmcmVxdWVuY3kgZGVuc2l0eSBzbyBiYXIgYXJlYSBpcyBwcm9wb3J0aW9uYWwgdG8gZnJlcXVlbmN5Lg==",
  "001012":
    "QWRkaW5nIDUgbWFya3MgdG8gZXZlcnkgc2NvcmUgaW4gYSBjbGFzcyBpbmNyZWFzZXMgYm90aCB0aGUgbWVhbiAkXG11JCBhbmQgc3RhbmRhcmQgZGV2aWF0aW9uICRcc2lnbWEkIGJ5IDUu",
  "001013":
    "VGhlIGludGVycXVhcnRpbGUgcmFuZ2UgKElRUikgaXMgZGlyZWN0bHkgYWZmZWN0ZWQgaWYgdGhlIG1heGltdW0gdmFsdWUgaXMgcmVwbGFjZWQgYnkgYW4gZXh0cmVtZSBvdXRsaWVyLg==",
  "001014":
    "QSBiYXIgZ3JhcGggd2l0aCBnYXBzIGJldHdlZW4gYmFycyBpcyBzdWl0YWJsZSBmb3IgcXVhbGl0YXRpdmUgb3IgdW5ncm91cGVkIGRpc2NyZXRlIGRhdGEu",
  "001015":
    "TUFUQ0hJTkcgUTE14oCTMTggwrcgd3JpdGUgb25lIGxldHRlciwgUCB0byBULCBpbiBlYWNoIGJveCDCtyAxIG1hcmsgZWFjaFxuXG5bRmlndXJlOiB0YWJsZV1cblxuMTUuIE9yZGVyZWQgZGlzcGxheSByZXRhaW5pbmcgZXZlcnkgZXhhY3QgcmF3IHZhbHVlXG4xNi4gUXVhbnRpdHkgcGxvdHRlZCB2ZXJ0aWNhbGx5IG9uIGFuIHVuZXF1YWwtd2lkdGggaGlzdG9ncmFtXG4xNy4gU21vb3RoIGN1cnZlIHBsb3R0ZWQgYXQgdXBwZXIgY2xhc3MgYm91bmRhcmllcyB0byBlc3RpbWF0ZSBxdWFydGlsZXNcbjE4LiBBdmVyYWdlIG9mIHRoZSBzcXVhcmVkIGRldmlhdGlvbnMgb2YgYWxsIGRhdGEgdmFsdWVzIGZyb20gzrw=",
  "001019":
    "U2l4IG1hbmdvZXMgaGF2ZSBhIG1lYW4gbWFzcyBvZiAyNDAgZy4gQSBzZXZlbnRoIG1hbmdvIGlzIGFkZGVkLCByYWlzaW5nIHRoZSBtZWFuIG9mIGFsbCBzZXZlbiB0byAyNTAgZy4gWzNdCioqKGEpKiogVG90YWwgbWFzcyBvZiB0aGUgc2l4ICAqKihiKSoqIE1hc3Mgb2YgdGhlIHNldmVudGggbWFuZ28=",
  "001020":
    "TWFzc2VzICRtJCAoZykgb2YgMjAgdGlsYXBpYSBmaWxsZXRzOiA4IGZpbGxldHMgaW4gJDEyMCBcbGUgbSA8IDE2MCQgYW5kIDEyIGZpbGxldHMgaW4gJDE2MCBcbGUgbSA8IDIwMCQuIFs0XQoqKihhKSoqIE1pZHBvaW50cyBvZiB0aGUgdHdvIGNsYXNzZXMgICoqKGIpKiogRXN0aW1hdGVkIG1lYW4gbWFzcw==",
  "001021":
    "VGhlIG9naXZlIHNob3dzIHRlc3Qgc2NvcmVzIChvdXQgb2YgODApIG9mIDEyMCBzdHVkZW50cywgcGFzc2luZyB0aHJvdWdoICg0MCwgMzApLCAoNTAsIDYwKSBhbmQgKDYwLCA5MCkuIERpc3RpbmN0aW9uIHJlcXVpcmVzICoqbW9yZSB0aGFuIDYwIG1hcmtzKiouIFszXQoKW0ZpZ3VyZTogVGVzdCBzY29yZXMgb2YgMTIwIHN0dWRlbnRzXQoqKk1lZGlhbjoqKiAgICoqJFFfMSQ6KiogICAqKkRpc3RpbmN0aW9uIHN0dWRlbnRzOioq",
  "001022":
    "VGhlIHVuZXF1YWwtd2lkdGggaGlzdG9ncmFtIHNob3dzIHRydW5rIGRpYW1ldGVycyAkZCQgKGNtKSBpbiBhIHRlYWsgcGxvdCBhY3Jvc3MgMOKAkzEwLCAxMOKAkzI1IGFuZCAyNeKAkzQ1IGNtLiBbM10KCltGaWd1cmU6IFRydW5rIGRpYW1ldGVycyBpbiBhIHRlYWsgcGxvdF0KKiooYSkqKiBUcmVlcyBpbiAxMOKAkzI1IGNtICAqKihiKSoqIFRvdGFsIHRyZWVzIGluIHRoZSBwbG90",
  "001023":
    "Rml2ZSBtYWl6ZSBwbGFudHMgaGF2ZSBoZWlnaHRzIChjbSk6IDExLCAxNCwgMTUsIDE3LCAxOCAodHJlYXQgYXMgYSBjb21wbGV0ZSBwb3B1bGF0aW9uKS4gRmluZDogWzVdCioqUmFuZ2U6KiogICAqKk1lZGlhbjoqKiAgICoqTWVhbiAkXG11JDoqKiAgICoqVmFyaWFuY2UgJFxzaWdtYV4yJDoqKiAgICoqU0QgJFxzaWdtYSQgKDIgZC5wLik6Kio=",
  "001024":
    "RGFpbHkgc29sYXIgb3V0cHV0IChrV2gpIHN1bW1hcnk6IE1pbiA9IDE0MCwgJFFfMSQgPSAyMDAsIE1lZGlhbiA9IDIyNSwgJFFfMyQgPSAyNDAsIE1heCA9IDMxNS4gVXNpbmcgdGhlICQxLjUgXHRpbWVzIElRUiQgY3JpdGVyaW9uOiBbNF0KKipJUVI6KiogICAqKkxvd2VyIGZlbmNlOioqICAgKipVcHBlciBmZW5jZToqKiAgICoqQXJlIGFueSB2YWx1ZXMgb3V0bGllcnM/IChZZXMvTm8gKyB2YWx1ZSk6Kio=",
  "001025":
    "KipDb21wbGV0ZSoqIHRoZSBtaXNzaW5nIGVudHJpZXMgaW4gdGhpcyBjb250aW51b3VzIGdyb3VwZWQgdGFibGU6IFs0XQpUaW1lIHQgKG1pbikKIHwgQ2xhc3Mgd2lkdGgKIHwgRnJlcXVlbmN5CiB8IEZyZXEuIGRlbnNpdHkKCjAg4omkIHQgPCAxMAogfCAxMAogfCAxNQogfCAoYSkgX19fX19fX18KCjEwIOKJpCB0IDwgMjUKIHwgKGIpIF9fX19fX19fCiB8IDM2CiB8IChjKSBfX19fX19fXwoKMjUg4omkIHQgPCA0NQogfCAyMAogfCAoZCkgX19fX19fX18KIHwgMC42CgoqKihhKSoqIEZyZXF1ZW5jeSBkZW5zaXR5ICAgKiooYikqKiBDbGFzcyB3aWR0aCAgICoqKGMpKiogRnJlcXVlbmN5IGRlbnNpdHkgICAqKihkKSoqIEZyZXF1ZW5jeQ==",
  "001026":
    "Q29tbXV0ZSB0aW1lczogJDAgXGxlIHQgPCAxMCQgJChmPTYpJCwgJDEwIFxsZSB0IDwgMjAkICQoZj1rKSQsICQyMCBcbGUgdCA8IDMwJCAkKGY9OSkkLiBHaXZlbiB0aGUgZXN0aW1hdGVkIG1lYW4gaXMgMTYgbWluOiBbM10KJDYoNSkgKyA5KDI1KSA9JCBfX19fX18gICRcUmlnaHRhcnJvdyQgICRrID0kIF9fX19fXw==",
  "001027":
    "U2Vuc29yIHJlYWRpbmdzICR4JCBoYXZlIG1lYW4gJFxtdV94ID0gMzAkIGFuZCBTRCAkXHNpZ21hX3ggPSAyLjUkLiBFYWNoIHZhbHVlIGlzIHJlc2NhbGVkIGJ5ICR5ID0gMnggLSAxMCQuICoqRmluZDoqKiBbM10KKiokXG11X3kkOioqICAgKiokXHNpZ21hX3kkOioqICAgKipWYXJpYW5jZSAkXHNpZ21hX3leMiQ6Kio=",
  "001028":
    "Rml2ZSBlcXVhbGx5IHNwYWNlZCBpbnRlZ2VycyAkXHsxMiwgMTYsIDIwLCAyNCwgMjhcfSQgKHN0ZXAgJGQgPSA0JCk6IFszXQoqKs68OioqICAgKipFeGFjdCDPgzoqKiAgICoqU3RlcCAkZD4wJCBmb3IgJFxzaWdtYSA9IDVcc3FydHsyfSQ6Kio=",
  "001029":
    "UGFyYWxsZWwgYm94IHBsb3RzIGNvbXBhcmUgZGVsaXZlcnkgdGltZXMgKG1pbikgb2YgRmFzdCBhbmQgRXhwcmVzcyBjb3VyaWVyczogWzRdCgpbRmlndXJlOiBGYXN0IGNvdXJpZXIgZGVsaXZlcnkgdGltZXNdCgpbRmlndXJlOiBFeHByZXNzIGNvdXJpZXIgZGVsaXZlcnkgdGltZXNdCioqRmFzdCBNZWQ6KiogICAqKkZhc3QgSVFSOioqICAgKipFeHByZXNzIElRUjoqKiAgICoqTW9yZSBjb25zaXN0ZW50Oioq",
  "001030":
    "KipDbGFzc2lmeSoqIGVhY2ggdmFyaWFibGUgKFF1YWxpdGF0aXZlIC8gRGlzY3JldGUgLyBDb250aW51b3VzKSBhbmQgKipzdGF0ZSoqIGFuIGFwcHJvcHJpYXRlIGRpc3BsYXkgKEJhciBncmFwaCBvciBIaXN0b2dyYW0pOiBbM10KVmFyaWFibGUKIHwgRGF0YSBUeXBlCiB8IFN1aXRhYmxlIERpc3BsYXkKCkZhdm91cml0ZSBzcG9ydAogfCBfX19fX19fXwogfCBfX19fX19fXwoKR29hbHMgcGVyIG1hdGNoCiB8IF9fX19fX19fCiB8IF9fX19fX19fCgoxMDAgbSB0aW1lIChzKQogfCBfX19fX19fXwogfCBfX19fX19fXw==",
  "001031":
    "KipRVUVTVElPTiAxIMK3IENSSVRFUklPTiBBOiBLTk9XSU5HICYgVU5ERVJTVEFORElORyBbMTAgbWFya3NdKioKKiooYSkqKiBMZW5ndGhzIG9mIDUwIGNvY29hIHBvZHMgKG1lYXN1cmVkIHRvIHRoZSBuZWFyZXN0IG1tKToKTGVuZ3RoIChtbSkKIHwgMjDigJMyOQogfCAzMOKAkzM5CiB8IDQw4oCTNDkKIHwgNTDigJM1OQoKRnJlcXVlbmN5IGYKIHwgOAogfCAyMAogfCAxNAogfCA4CgoqKihpKSoqIFN0YXRlIHRoZSBsb3dlciBhbmQgdXBwZXIgY2xhc3MgYm91bmRhcmllcyBvZiAzMOKAkzM5IG1tLiBbMV0KKiooaWkpKiogU3RhdGUgdGhlIG1vZGFsIGNsYXNzIGFuZCB0aGUgY2xhc3MgY29udGFpbmluZyB0aGUgbWVkaWFuLiBbMV0KKiooaWlpKSoqIFVzaW5nIGNsYXNzIG1pZHBvaW50cywgKipjYWxjdWxhdGUqKiBhbiBlc3RpbWF0ZSBvZiB0aGUgbWVhbiBwb2QgbGVuZ3RoLiBbMl0KKiooYikqKiBUaGUgY3VtdWxhdGl2ZSBmcmVxdWVuY3kgY3VydmUgc2hvd3Mgd2Vla2x5IHJldmlzaW9uIGhvdXJzICRoJCBvZiA4MCBNWVAgNCBzdHVkZW50cywgcGFzc2luZyB0aHJvdWdoICg4LCAyMCksICgxMiwgNDApLCAoMTYsIDYwKSBhbmQgKDIwLCA3MikuCgpbRmlndXJlOiBXZWVrbHkgcmV2aXNpb24gaG91cnMgb2YgODAgc3R1ZGVudHNdCioqKGkpKiogRmluZCB0aGUgbWVkaWFuLCAkUV8xJCwgJFFfMyQgYW5kIElRUi4gWzJdCioqKGlpKSoqIEZpbmQgdGhlIG51bWJlciBhbmQgcGVyY2VudGFnZSBvZiBzdHVkZW50cyByZXZpc2luZyBtb3JlIHRoYW4gMjAgaG91cnMuIFsxXQoqKihjKSoqIFdhaXRpbmcgdGltZXMgJHQkIChtaW4pIG9mIDUxIHBhdGllbnRzOiAkMCBcbGUgdCA8IDUkICQoZj0xMCkkLCAkNSBcbGUgdCA8IDE1JCAkKGY9MjUpJCwgJDE1IFxsZSB0IDwgMzUkICQoZj0xNikkLgoqKihpKSoqICoqQ2FsY3VsYXRlKiogdGhlIGZyZXF1ZW5jeSBkZW5zaXR5IG9mIGVhY2ggY2xhc3MuIFsyXQoqKihpaSkqKiBPbiBhIGhpc3RvZ3JhbSB3aGVyZSAxIHVuaXQgb2YgZnJlcXVlbmN5IGRlbnNpdHkgPSAyIGNtIHZlcnRpY2FsbHksIGZpbmQgdGhlIGJhciBoZWlnaHQgKGluIGNtKSBmb3IgZWFjaCBjbGFzcy4gWzFd",
  "001032":
    "KipRVUVTVElPTiAyIMK3IENSSVRFUklPTiBCOiBJTlZFU1RJR0FUSU5HIFBBVFRFUk5TIFsxMCBtYXJrc10qKgoqKihhKSoqIFNpeCBvcmRlcmVkIHRlc3Qgc2NvcmVzIGFyZSAkXHs0MCwgNDIsIDQ0LCA0NiwgNDgsIDUwXH0kLgoqKihpKSoqICoqQ2FsY3VsYXRlKiogdGhlIG1lYW4sIG1lZGlhbiBhbmQgSVFSIG9mIHRoZXNlIDYgc2NvcmVzLiBbMl0KKiooaWkpKiogQSBzZXZlbnRoIHN0dWRlbnQgc2NvcmVzICR5ID0gMTAkLiAqKkZpbmQqKiB0aGUgbmV3IG1lYW4sIG1lZGlhbiBhbmQgSVFSIG9mIGFsbCA3IHNjb3Jlcy4gWzJdCioqKGIpKiogU3VwcG9zZSB0aGUgc2V2ZW50aCBzY29yZSBpcyBhbnkgdmFsdWUgJHkkIHNhdGlzZnlpbmcgJDAgXGxlIHkgXGxlIDQwJC4KKiooaSkqKiAqKldyaXRlKiogYSBmb3JtdWxhIGluIHRlcm1zIG9mICR5JCBmb3IgdGhlIG1lYW4gb2YgdGhlIDcgc2NvcmVzLiBbMV0KKiooaWkpKiogKipJbnZlc3RpZ2F0ZSoqIHRoZSBtZWRpYW4gYW5kIElRUiBmb3IgZGlmZmVyZW50IHZhbHVlcyBvZiAkeSQgaW4gJDAgXGxlIHkgXGxlIDQwJCwgKipzdGF0ZSoqIGEgZ2VuZXJhbCBydWxlLCBhbmQgKipleHBsYWluKiogbWF0aGVtYXRpY2FsbHkgd2h5IGJvdGggcmVtYWluIGludmFyaWFudCBhY3Jvc3MgdGhpcyBpbnRlcnZhbC4gWzJdCioqKGMpKiogKipDb21wYXJlKiogdHdvIDgtdmFsdWUgZGF0YXNldHMgKGluIGtnKToK4oCiIFNldCBBOiAkXHsxLCAyLCAyLCAzLCA0LCAxMSwgMTIsIDEzXH0kICAg4oCiIFNldCBCOiAkXHszLCA0LCA1LCA2LCA3LCAxMywgMTUsIDE3XH0kCioqKGkpKiogKipDb21wdXRlKiogdGhlIGV4YWN0IG1lYW4gb2YgU2V0IEEgYW5kIG9mIFNldCBCLiBbMV0KKiooaWkpKiogR3JvdXAgYm90aCBzZXRzIGludG8gJDAgXGxlIHggPCAxMCQgYW5kICQxMCBcbGUgeCA8IDIwJCwgKipzaG93KiogdGhleSBwcm9kdWNlIHRoZSBzYW1lIGdyb3VwZWQgZXN0aW1hdGVkIG1lYW4sIGFuZCAqKmV4cGxhaW4qKiB3aHkgdGhlIG1pZHBvaW50IGVzdGltYXRlIGlzIGV4YWN0IGZvciBTZXQgQiBidXQgb3ZlcmVzdGltYXRlcyBTZXQgQS4gWzJd",
  "001033":
    "KipRVUVTVElPTiAzIMK3IENSSVRFUklPTiBDOiBDT01NVU5JQ0FUSU5HIFsxMCBtYXJrc10qKgoqKihhKSoqIFN0YW5kaW5nIGJyb2FkLWp1bXAgZGlzdGFuY2VzIChjbSkgb2YgOSBhdGhsZXRlcyBiZWZvcmUgYW5kIGFmdGVyIGFuIDgtd2VlayBwbHlvbWV0cmljIHByb2dyYW1tZToK4oCiICoqQmVmb3JlOioqIDExNSwgMTI4LCAxMjIsIDEzMSwgMTE5LCAxMjUsIDEzNSwgMTI0LCAxMTgK4oCiICoqQWZ0ZXI6KiogMTI5LCAxNDIsIDEzNiwgMTQ4LCAxMzMsIDEzOSwgMTUxLCAxNDQsIDEyOAoqKihpKSoqICoqQ29uc3RydWN0KiogYW4gb3JkZXJlZCBiYWNrLXRvLWJhY2sgc3RlbS1hbmQtbGVhZiBkaWFncmFtIChzdGVtcyAxMSB0byAxNSBpbiB0aGUgY2VudHJlKSB3aXRoIGEgY2xlYXIgZHVhbCBrZXkuIFszXQoqKihpaSkqKiAqKlN0YXRlKiogdGhlIG1lZGlhbiBhbmQgcmFuZ2Ugb2YgZWFjaCBncm91cCBhbmQgKip3cml0ZSoqIHR3byBjb25jaXNlIHN0YXRpc3RpY2FsIHNlbnRlbmNlcyBjb21wYXJpbmcgcGVyZm9ybWFuY2UuIFsyXQoqKihiKSoqIEtvZmkgc3VydmV5ZWQgZGVsaXZlcnkgZGlzdGFuY2VzICRkJCAoa20pIGZvciA1MCBvcmRlcnM6ICQwIFxsZSBkIDwgMTAkICQoZj0xMikkLCAkMTAgXGxlIGQgPCAyMCQgJChmPTE4KSQsICQyMCBcbGUgZCA8IDQwJCAkKGY9MjApJCwgYW5kIGRyZXcgdGhlIGNoYXJ0IHNob3duLgoKW0ZpZ3VyZTogS29maSdzIGRlbGl2ZXJ5LWRpc3RhbmNlIGNoYXJ0XQoqKihpKSoqICoqSWRlbnRpZnkqKiB0d28gc3RhdGlzdGljYWwgZXJyb3JzIGluIEtvZmkncyBjaGFydC4gWzJdCioqKGlpKSoqICoqQ2FsY3VsYXRlKiogdGhlIGZyZXF1ZW5jeSBkZW5zaXRpZXMgYW5kICoqZHJhdyoqIGEgY29ycmVjdGx5IHNjYWxlZCBoaXN0b2dyYW0gb24geW91ciBwYXBlci4gWzNd",
  "001034":
    "KipRVUVTVElPTiA0IMK3IENSSVRFUklPTiBEOiBSRUFMLUxJRkUgQ09OVEVYVFMgWzEwIG1hcmtzXSoqCioqKGEpKiogQW4gQWxsYWRhIHBpbmVhcHBsZSBjYW5uZXJ5IGNoZWNrcyBhIHBvcHVsYXRpb24gYmF0Y2ggb2YgOCBjYW5zOgpOZXQgbWFzcyB4IChnKQogfCAzOTgKIHwgMzk5CiB8IDQwMAogfCA0MDEKIHwgNDAyCgpOdW1iZXIgb2YgY2FucyBmCiB8IDEKIHwgMgogfCAyCiB8IDIKIHwgMQoKUXVhbGl0eSBjb250cm9sIHJlcXVpcmVzICQzOTkuNSBcbGUgXG11IFxsZSA0MDAuNSQgZyBhbmQgJFxzaWdtYSBcbGUgMS4yMCQgZy4gKipDYWxjdWxhdGUqKiAkXG11JCBhbmQgJFxzaWdtYSQgKHRvIDIgZC5wLikgYW5kICoqZGV0ZXJtaW5lKiogd2hldGhlciB0aGUgYmF0Y2ggcGFzc2VzIGJvdGggcnVsZXMuIFs0XQoqKihiKSoqIERhaWx5IHNvbGFyIGVuZXJneSBnZW5lcmF0ZWQgb3ZlciAzMCBkYXlzIGF0IGEgQ290b25vdSBjbGluaWM6Ck91dHB1dCBFIChrV2gpCiB8IDgg4omkIEUgPCAxMgogfCAxMiDiiaQgRSA8IDE2CiB8IDE2IOKJpCBFIDwgMjAKIHwgMjAg4omkIEUgPCAyNAoKTnVtYmVyIG9mIGRheXMKIHwgNQogfCAxMwogfCA5CiB8IDMKClRoZSBjbGluaWMgcmVxdWlyZXMgYXQgbGVhc3QgNDUwIGtXaCBvdmVyIHRoZSAzMCBkYXlzIHRvIHJ1biBpdHMgdmFjY2luZSByZWZyaWdlcmF0b3JzIHdpdGhvdXQgZ3JpZCBiYWNrdXAuICoqRXN0aW1hdGUqKiB0aGUgdG90YWwgZW5lcmd5IGdlbmVyYXRlZCBhbmQgZGFpbHkgbWVhbiwgYW5kICoqYWR2aXNlKiogdGhlIGNsaW5pYyBkaXJlY3Rvci4gWzNdCioqKGMpKiogQSBjb2FzdGFsIHdlYXRoZXIgc3RhdGlvbiBtdXN0IGNob29zZSBiZXR3ZWVuIHR3byBzZW5zb3ItYmF0dGVyeSBicmFuZHMgKGxpZmV0aW1lcyBpbiBtb250aHMpIGFuZCByZXF1aXJlcyBhdCBsZWFzdCAzNCBtb250aHMgb2YgdW5pbnRlcnJ1cHRlZCBvcGVyYXRpb24gYmVmb3JlIHNjaGVkdWxlZCBtYWludGVuYW5jZToK4oCiIEJyYW5kIEFscGhhOiAkXG11ID0gMzYuNCQsICRcc2lnbWEgPSAwLjkkLCBJUVIgPSAxLjQK4oCiIEJyYW5kIEJldGE6ICRcbXUgPSAzOC4wJCwgJFxzaWdtYSA9IDMuNCQsIElRUiA9IDUuMgoqKlJlY29tbWVuZCoqIG9uZSBicmFuZCB1c2luZyBib3RoIGNlbnRyZSBhbmQgc3ByZWFkLCBhbmQgKipzdGF0ZSoqIG9uZSByZWFsLXdvcmxkIGxpbWl0YXRpb24gb2YgcmVseWluZyBvbmx5IG9uIHN1bW1hcnkgc3RhdGlzdGljcy4gWzNd",
};

/** Question rows: [id suffix, type, points, criterion, sheet question number] */
const ROWS = [
  ["001001", "single_choice", 1, "A", 1],
  ["001031", "assess_parts", 10, "A", 1],
  ["001002", "single_choice", 1, "B", 2],
  ["001032", "assess_parts", 10, "B", 2],
  ["001003", "single_choice", 1, "C", 3],
  ["001033", "assess_parts", 10, "C", 3],
  ["001004", "single_choice", 1, "D", 4],
  ["001034", "assess_parts", 10, "D", 4],
  ["001005", "single_choice", 1, "A", 5],
  ["001006", "single_choice", 1, "C", 6],
  ["001007", "single_choice", 1, "A", 7],
  ["001008", "single_choice", 1, "C", 8],
  ["001009", "single_choice", 1, "D", 9],
  ["001010", "true_false", 1, "A", 10],
  ["001011", "true_false", 1, "A", 11],
  ["001012", "true_false", 1, "C", 12],
  ["001013", "true_false", 1, "B", 13],
  ["001014", "true_false", 1, "A", 14],
  ["001015", "matching", 4, "C", 15],
  ["001019", "assess_parts", 3, "D", 19],
  ["001020", "assess_parts", 4, "A", 20],
  ["001021", "assess_parts", 3, "D", 21],
  ["001022", "assess_parts", 3, "D", 22],
  ["001023", "assess_parts", 5, "A", 23],
  ["001024", "assess_parts", 4, "D", 24],
  ["001025", "assess_parts", 4, "A", 25],
  ["001026", "assess_parts", 3, "B", 26],
  ["001027", "assess_parts", 3, "B", 27],
  ["001028", "assess_parts", 3, "B", 28],
  ["001029", "assess_parts", 4, "C", 29],
  ["001030", "assess_parts", 3, "C", 30],
];

/** Multiple-choice / true-false keys: [letter, is_correct]. */
const OPTION_ROWS = {
  "001001": [["A", false], ["B", false], ["C", true], ["D", false]],
  "001002": [["A", false], ["B", true], ["C", false], ["D", false]],
  "001003": [["A", true], ["B", false], ["C", false], ["D", false]],
  "001004": [["A", true], ["B", false], ["C", false], ["D", false]],
  "001005": [["A", false], ["B", false], ["C", true], ["D", false]],
  "001006": [["A", false], ["B", true], ["C", false], ["D", false]],
  "001007": [["A", false], ["B", true], ["C", false], ["D", false]],
  "001008": [["A", true], ["B", false], ["C", false], ["D", false]],
  "001009": [["A", false], ["B", false], ["C", true], ["D", false]],
  "001010": [["A", true], ["B", false]],
  "001011": [["A", true], ["B", false]],
  "001012": [["A", false], ["B", true]],
  "001013": [["A", false], ["B", true]],
  "001014": [["A", true], ["B", false]],
};

const OPTION_IDS = {
  "001001": ["1a5ea235-d4bc-4016-a7ff-9fa04a62f8e8", "a203eb6d-7e1a-4814-a21b-25ecf1c185b1", "7e185a4d-bcad-48e0-aba4-bf5989491936", "d38d0ddf-ff90-46ba-89a3-d962781e756e"],
  "001002": ["7c490ad0-4d0a-4f4c-8194-71a98575ed7a", "1fd34cce-51c7-4a36-bbc2-cde08526bf96", "72cf06a3-61cf-4608-adfe-9a8110222a5f", "7cb3161a-e53f-43f0-bde0-e398fad39f68"],
  "001003": ["fef5738e-1a7b-4b2e-aa1b-39ef070b0155", "c45c5ba6-bf3a-4250-8537-6539cf580963", "266beddb-6c2c-4b94-8f2c-8285bac8748d", "72f65e06-597e-4df5-a004-554f97facc58"],
  "001004": ["6bc7e0a6-f8be-4fa0-834f-45c730a78431", "00d0bb1f-9f32-4aa9-a5a0-a6325736a561", "bdc630f9-66ec-4eb1-93a7-10eff990b620", "dcb0c6bd-368e-4ac1-976c-f7f5a1284264"],
  "001005": ["b243a892-d744-465c-824e-0570e1e72fb9", "7fb4e00c-8706-4969-8679-4207fdaa5951", "a64f9382-5cc4-4d22-920a-10ba28828ab9", "88d58c44-dccc-4eac-80d1-d166c253c1f8"],
  "001006": ["fb598906-e148-4b6d-a168-263e1e7b53b5", "39407ba6-adb4-43f9-aecd-5a022a7d2e91", "50f1c98a-3191-4b9e-851a-bb43325180a9", "1fab2450-413a-48d7-be34-c8a91f3a7c52"],
  "001007": ["0a4d47db-144c-4c83-a977-7735c9bd8b1f", "5a999ac7-4282-42c1-a08f-8207efa96bc3", "b47b145a-348a-43d8-be66-e61ced7525dd", "0d8502b1-cee5-49aa-9e26-e9a1d46b3dfb"],
  "001008": ["f0c04f44-eb08-4717-90dc-d4eac8544b2f", "d9dc577a-3db6-4b61-b73d-95404ad6e202", "e94744dc-dab6-49d5-b751-7215c17f466a", "09206380-0216-4e87-9201-e510bb769951"],
  "001009": ["fcbf37df-2043-4572-a4f4-9f98f6f81012", "34edb9db-6120-4854-918e-b321d54f2f2f", "234f8a10-d7b8-428e-aa32-745380827386", "9340aa26-079f-4827-9f27-addf1a8228fe"],
  "001010": ["f7842dd1-d688-4338-bd94-de08cbadce91", "404929e8-3f07-4f14-a3ca-e032a38d6bd8"],
  "001011": ["8569c7f4-2c0f-4b5e-bca7-75160adc477e", "ce019866-12b7-4aff-88f4-d51c996653a6"],
  "001012": ["3b850e0f-109b-43d2-8cb1-4feb07278d17", "deac8976-356b-4ef5-b05e-92aea1484102"],
  "001013": ["7ce6b068-d17c-4f76-95b6-560bf2ddf4cd", "b08b84a5-f65d-4885-aad2-a00416a4b3f1"],
  "001014": ["33f71eb3-8e3e-47e6-8b61-0bcfa96ed10a", "a72001b2-d32f-4c98-a012-e81908299450"],
};

/**
 * Part specs, transcribed from `questions.config->parts`.
 *
 * Fields: [id, label, kind, points, unit, correct answer, prompt]
 */
/**
 * Accepted answers transcribed from production for the text/expression parts.
 * Without them a part is not a markable part, so the projection would drop it
 * and the paper would silently lose questions.
 */
const ACCEPTED = {
  "001024": {
    out: ["Yes, 315", "Yes 315 kWh", "Yes \u2014 315", "Yes (315)"],
  },
  "001028": {
    sd: ["4\u221a2", "4 sqrt 2", "4root2", "\u221a32", "5.66"],
  },
  "001029": {
    more: ["Fast", "Fast courier", "Fast is more consistent"],
  },
  "001030": {
    goals: ["Discrete, Bar graph", "Discrete bar graph", "Discrete; bar chart"],
    sport: ["Qualitative, Bar graph", "Qualitative bar graph", "Qualitative; bar chart"],
    time: ["Continuous, Histogram", "Continuous histogram", "Continuous; histogram"],
  },
  "001031": {
    a1: ["29.5 and 39.5", "29.5 mm and 39.5 mm", "29.5, 39.5", "29.5 to 39.5"],
    a2: ["30\u201339 and 30\u201339", "30-39 mm; 30-39 mm", "Both 30\u201339 mm", "30\u201339 mm, 30\u201339 mm"],
    b1: ["median 12 h, Q1 8 h, Q3 16 h, IQR 8 h", "12, 8, 16, 8", "Med 12, Q1 8, Q3 16, IQR 8"],
    b3: ["8 students, 10%", "8 and 10%", "8, 10%", "8 students (10%)"],
    c1: ["2.0 and 2.5", "2, 2.5", "2.0, 2.5"],
    c3: ["4, 5, 1.6", "4.0, 5.0, 1.6", "4 cm, 5 cm, 1.6 cm"],
  },
  "001032": {
    a2: ["45 and 6", "median 45, IQR 6", "45, 6"],
    a4: ["44 and 8", "median 44, IQR 8", "44, 8"],
    b1: ["(270+y)/7", "(y+270)/7", "270/7 + y/7"],
    b2: ["Median 44 and IQR 8 for every y", "Median stays 44, IQR stays 8", "Both remain constant: median 44, IQR 8"],
    b3: ["y is always first, so the 2nd, 4th and 6th values do not change", "y occupies the first position so Q1, median and Q3 are unchanged"],
    c1: ["6.0 and 8.75", "6 and 8.75", "Set A 6, Set B 8.75"],
    c3: ["Set B class means equal the midpoints, but Set A values cluster near the lower boundaries", "B's values average to the midpoints; A's are lower within each class"],
  },
  "001033": {
    a2: ["Before 124 cm range 20 cm; after 139 cm range 23 cm", "Before median 124, range 20; After median 139, range 23"],
    a3: ["The median increased by 15 cm, so typical performance improved; the range increased by 3 cm, so spread increased slightly", "Median improved by 15 cm but range is 3 cm larger"],
    b1: ["Gaps between bars / equal bar widths for continuous unequal classes", "The bars have gaps and equal widths although the classes are continuous and unequal"],
    b2: ["Raw frequency plotted instead of frequency density", "The vertical axis should be frequency density"],
    b3: ["1.2, 1.8, 1.0", "1.2 1.8 1.0", "1.2, 1.8 and 1.0"],
  },
  "001034": {
    a4: ["No, \u03c3 = 1.22 g > 1.20 g", "No \u2014 standard deviation exceeds 1.20 g", "Fails because \u03c3 exceeds 1.20 g"],
    b3: ["The target is met (460 kWh \u2265 450 kWh), but the margin is small", "Yes, 460 kWh exceeds 450 kWh; only a 10 kWh margin"],
    c1: ["Brand Alpha", "Alpha"],
    c2: ["Beta has a higher mean but much larger spread, so Alpha is more reliable above 34 months", "Alpha has a slightly lower mean but much smaller \u03c3 and IQR, so fewer batteries fall below 34 months"],
    c3: ["Summary statistics hide the shape of the distribution and the test conditions", "They do not show sample size, distribution shape, cost or coastal conditions"],
  },
};

const PARTS = {
  "001031": [
    ["a1", "(a)(i)", "text", 1, "-", null, "Lower and upper boundaries of 30\u201339 mm"],
    ["a2", "(a)(ii)", "text", 1, "-", null, "Modal class and class containing the median"],
    ["a3", "(a)(iii) total", "numeric", 1, "mm", 1945, "Weighted total using midpoints"],
    ["a4", "(a)(iii) mean", "numeric", 1, "mm", 38.9, "Estimated mean pod length (1 d.p.)"],
    ["b1", "(b)(i) quartiles", "text", 2, "-", null, "Median, Q1, Q3 and IQR of revision times"],
    ["b3", "(b)(ii)", "text", 1, "-", null, "Number and percentage revising more than 20 hours"],
    ["c1", "(c)(i) first two", "text", 1, "-", null, "Frequency densities for the first two classes"],
    ["c2", "(c)(i) third", "numeric", 1, "-", 0.8, "Frequency density for 15 \u2264 t < 35"],
    ["c3", "(c)(ii)", "text", 1, "-", null, "Bar heights in cm for the three classes"],
  ],
  "001032": [
    ["a1", "(a)(i) mean", "numeric", 1, "-", 45, "Mean of the six scores"],
    ["a2", "(a)(i) median & IQR", "text", 1, "-", null, "Median and IQR of the six scores"],
    ["a3", "(a)(ii) mean", "numeric", 1, "-", 40, "New mean of all seven scores"],
    ["a4", "(a)(ii) median & IQR", "text", 1, "-", null, "New median and IQR of all seven scores"],
    ["b1", "(b)(i)", "expression", 1, "-", null, "Formula for the mean of the seven scores"],
    ["b2", "(b)(ii) rule", "text", 1, "-", null, "State the rule for the median and IQR"],
    ["b3", "(b)(ii) explanation", "text", 1, "-", null, "Explain why the median and IQR stay invariant"],
    ["c1", "(c)(i)", "text", 1, "-", null, "Exact means of Set A and Set B"],
    ["c2", "(c)(ii) grouped mean", "numeric", 1, "kg", 8.75, "Common grouped estimated mean"],
    ["c3", "(c)(ii) explanation", "text", 1, "-", null, "Explain why the midpoint estimate is exact for B but overestimates A"],
  ],
  "001033": [
    ["a2", "(a)(ii) medians and ranges", "text", 1, "-", null, "Median and range for each group"],
    ["a3", "(a)(ii) comparison", "text", 1, "-", null, "Two concise statistical sentences comparing performance"],
    ["b1", "(b)(i) error 1", "text", 1, "-", null, "First statistical error in Kofi's chart"],
    ["b2", "(b)(i) error 2", "text", 1, "-", null, "Second statistical error in Kofi's chart"],
    ["b3", "(b)(ii) frequency densities", "text", 2, "-", null, "Frequency densities for the three classes"],
  ],
  "001034": [
    ["a1", "(a) mean", "numeric", 1, "g", 400, "Population mean \u03bc (2 d.p.)"],
    ["a2", "(a) variance", "numeric", 1, "g\u00b2", 1.5, "Population variance \u03c3\u00b2"],
    ["a3", "(a) standard deviation", "numeric", 1, "g", 1.22, "Population standard deviation \u03c3 (2 d.p.)"],
    ["a4", "(a) decision", "text", 1, "-", null, "Does the batch pass both rules?"],
    ["b1", "(b) total", "numeric", 1, "kWh", 460, "Estimated 30-day total energy"],
    ["b2", "(b) daily mean", "numeric", 1, "kWh/day", 15.33, "Estimated daily mean energy (2 d.p.)"],
    ["b3", "(b) advice", "text", 1, "-", null, "Advice to the clinic director"],
    ["c1", "(c) recommendation", "text", 1, "-", null, "Recommended brand"],
    ["c2", "(c) reason", "text", 1, "-", null, "Reason using both centre and spread"],
    ["c3", "(c) limitation", "text", 1, "-", null, "One real-world limitation of relying only on summary statistics"],
  ],
  "001019": [
    ["a", "(a)", "numeric", 1, "g", 1440, "Total mass of the six mangoes"],
    ["b", "(b)", "numeric", 2, "g", 310, "Mass of the seventh mango"],
  ],
  "001020": [
    ["a1", "Midpoint 1", "numeric", 1, "g", 140, "Midpoint of $120 \\le m < 160$"],
    ["a2", "Midpoint 2", "numeric", 1, "g", 180, "Midpoint of $160 \\le m < 200$"],
    ["b1", "Weighted total", "numeric", 1, "-", 3280, "Calculate $\\Sigma fm$"],
    ["b2", "Estimated mean", "numeric", 1, "g", 164, "Estimated mean mass"],
  ],
  "001021": [
    ["q1", "Q1", "numeric", 1, "marks", 40, "Lower quartile"],
    ["med", "Median", "numeric", 1, "marks", 50, "Median score"],
    ["dist", "Distinction students", "numeric", 1, "students", 30, "Number of students with more than 60 marks"],
  ],
  "001022": [
    ["a", "(a)", "numeric", 1, "trees", 30, "Number of trees in 10\u201325 cm"],
    ["b1", "Outer classes", "numeric", 1, "trees", 32, "Total trees in 0\u201310 cm and 25\u201345 cm"],
    ["b2", "(b)", "numeric", 1, "trees", 62, "Total trees in the plot"],
  ],
  "001023": [
    ["range", "Range", "numeric", 1, "cm", 7, "Range"],
    ["median", "Median", "numeric", 1, "cm", 15, "Median"],
    ["mean", "Mean", "numeric", 1, "cm", 15, "Population mean \u03bc"],
    ["var", "Variance", "numeric", 1, "cm\u00b2", 6, "Population variance \u03c3\u00b2"],
    ["sd", "SD", "numeric", 1, "cm", 2.45, "Population standard deviation \u03c3 (2 d.p.)"],
  ],
  "001024": [
    ["iqr", "IQR", "numeric", 1, "kWh", 40, "Interquartile range"],
    ["low", "Lower fence", "numeric", 1, "kWh", 140, "Lower fence"],
    ["high", "Upper fence", "numeric", 1, "kWh", 300, "Upper fence"],
    ["out", "Outliers", "text", 1, "-", null, "Are there outliers? Write Yes or No and the value."],
  ],
  "001025": [
    ["a", "(a)", "numeric", 1, "-", 1.5, "Frequency density for 0 \u2264 t < 10"],
    ["b", "(b)", "numeric", 1, "min", 15, "Class width for 10 \u2264 t < 25"],
    ["c", "(c)", "numeric", 1, "-", 2.4, "Frequency density for 10 \u2264 t < 25"],
    ["d", "(d)", "numeric", 1, "-", 12, "Frequency for 25 \u2264 t < 45"],
  ],
  "001026": [
    ["sum", "Weighted total", "numeric", 1, "-", 255, "Calculate $6(5) + 9(25)$"],
    ["k", "k", "numeric", 2, "-", 15, "Find k"],
  ],
  "001027": [
    ["mean", "Mean", "numeric", 1, "-", 50, "Mean \u03bcy"],
    ["sd", "SD", "numeric", 1, "-", 5, "Standard deviation \u03c3y"],
    ["var", "Variance", "numeric", 1, "-", 25, "Variance \u03c3y\u00b2"],
  ],
  "001028": [
    ["mean", "Mean", "numeric", 1, "-", 20, "Mean \u03bc"],
    ["sd", "Exact \u03c3", "text", 1, "-", null, "Exact population standard deviation"],
    ["d", "Step", "numeric", 1, "-", 5, "Step d for \u03c3 = 5\u221a2"],
  ],
  "001029": [
    ["med", "Fast Med", "numeric", 1, "min", 22, "Fast median delivery time"],
    ["fast", "Fast IQR", "numeric", 1, "min", 10, "Fast interquartile range"],
    ["express", "Express IQR", "numeric", 1, "min", 20, "Express interquartile range"],
    ["more", "More consistent", "text", 1, "-", null, "Which courier is more consistent?"],
  ],
  "001030": [
    ["sport", "Favourite sport", "text", 1, "-", null, "Data type and suitable display for favourite sport"],
    ["goals", "Goals per match", "text", 1, "-", null, "Data type and suitable display for goals per match"],
    ["time", "100 m time (s)", "text", 1, "-", null, "Data type and suitable display for 100 m time"],
  ],
};

/**
 * Option text lives in `question_options.content_doc`, not in `label` — `label`
 * is only the letter. Transcribed verbatim (Q9 options are inline maths).
 */
const OPTION_DOCS = {
  "1a5ea235-d4bc-4016-a7ff-9fa04a62f8e8": "Blood group (A, B, AB, O)",
  "a203eb6d-7e1a-4814-a21b-25ecf1c185b1": "Number of siblings",
  "7e185a4d-bcad-48e0-aba4-bf5989491936": "Body mass (in kg)",
  "d38d0ddf-ff90-46ba-89a3-d962781e756e": "Clinic ward code",
  "7c490ad0-4d0a-4f4c-8194-71a98575ed7a": "Mode 18, Med 24",
  "1fd34cce-51c7-4a36-bbc2-cde08526bf96": "Mode 18, Med 26",
  "72cf06a3-61cf-4608-adfe-9a8110222a5f": "Mode 26, Med 18",
  "7cb3161a-e53f-43f0-bde0-e398fad39f68": "Mode 8, Med 26",
  "fef5738e-1a7b-4b2e-aa1b-39ef070b0155": "Mean 16 mm, Range 12 mm",
  "c45c5ba6-bf3a-4250-8537-6539cf580963": "Mean 15 mm, Range 12 mm",
  "266beddb-6c2c-4b94-8f2c-8285bac8748d": "Mean 16 mm, Range 10 mm",
  "72f65e06-597e-4df5-a004-554f97facc58": "Mean 15.5 mm, Range 8 mm",
  "6bc7e0a6-f8be-4fa0-834f-45c730a78431": "Width 9 mm, Mid 54.5 mm",
  "00d0bb1f-9f32-4aa9-a5a0-a6325736a561": "Width 10 mm, Mid 55 mm",
  "bdc630f9-66ec-4eb1-93a7-10eff990b620": "Width 10 mm, Mid 54.5 mm",
  "dcb0c6bd-368e-4ac1-976c-f7f5a1284264": "Width 9 mm, Mid 54 mm",
  "b243a892-d744-465c-824e-0570e1e72fb9": "12",
  "7fb4e00c-8706-4969-8679-4207fdaa5951": "14",
  "a64f9382-5cc4-4d22-920a-10ba28828ab9": "20",
  "88d58c44-dccc-4eac-80d1-d166c253c1f8": "34",
  "fb598906-e148-4b6d-a168-263e1e7b53b5": "Modal 10\u201320; Med 20\u201330",
  "39407ba6-adb4-43f9-aecd-5a022a7d2e91": "Both are 20 \u2264 h < 30",
  "50f1c98a-3191-4b9e-851a-bb43325180a9": "Modal 20\u201330; Med 10\u201320",
  "1fab2450-413a-48d7-be34-c8a91f3a7c52": "Both are 10 \u2264 h < 20",
  "0a4d47db-144c-4c83-a977-7735c9bd8b1f": "IQR = 56, 75%",
  "5a999ac7-4282-42c1-a08f-8207efa96bc3": "IQR = 26, 75%",
  "b47b145a-348a-43d8-be66-e61ced7525dd": "IQR = 26, 50%",
  "0d8502b1-cee5-49aa-9e26-e9a1d46b3dfb": "IQR = 16, 75%",
  "f0c04f44-eb08-4717-90dc-d4eac8544b2f": "Mean 4.4\u21928; Med 4\u21924.5",
  "d9dc577a-3db6-4b61-b73d-95404ad6e202": "Mean 4.4\u21926; Med stays 4",
  "e94744dc-dab6-49d5-b751-7215c17f466a": "Mean stays 4.4; Med 4\u21928",
  "09206380-0216-4e87-9201-e510bb769951": "Both increase by 3.6 kg",
  "fcbf37df-2043-4572-a4f4-9f98f6f81012": "18",
  "34edb9db-6120-4854-918e-b321d54f2f2f": "3",
  "234f8a10-d7b8-428e-aa32-745380827386": { latex: "3\\sqrt{2}" },
  "9340aa26-079f-4827-9f27-addf1a8228fe": { latex: "\\sqrt{15}" },
  "f7842dd1-d688-4338-bd94-de08cbadce91": "True",
  "404929e8-3f07-4f14-a3ca-e032a38d6bd8": "False",
  "8569c7f4-2c0f-4b5e-bca7-75160adc477e": "True",
  "ce019866-12b7-4aff-88f4-d51c996653a6": "False",
  "3b850e0f-109b-43d2-8cb1-4feb07278d17": "True",
  "deac8976-356b-4ef5-b05e-92aea1484102": "False",
  "7ce6b068-d17c-4f76-95b6-560bf2ddf4cd": "True",
  "b08b84a5-f65d-4885-aad2-a00416a4b3f1": "False",
  "33f71eb3-8e3e-47e6-8b61-0bcfa96ed10a": "True",
  "a72001b2-d32f-4c98-a012-e81908299450": "False",
  "ee4d376d-2b68-4d78-82a4-73adeeec4cd5": "T",
};

/** Rebuild the TipTap doc shape the app stores for an option. */
function optionDoc(id) {
  const value = OPTION_DOCS[id];
  const node =
    typeof value === "string"
      ? { type: "text", text: value }
      : { type: "mathInline", attrs: { latex: value.latex } };
  return { type: "doc", content: [{ type: "paragraph", content: [node] }] };
}

/**
 * Melina's saved answers for attempt `ff1cb3ba-c166-4842-af65-a44dd853b4cb`,
 * exactly as `exam_answers.answer` stores them, with the awarded marks.
 */
const ANSWERS = {
  "001001": { answer: { option_id: "d38d0ddf-ff90-46ba-89a3-d962781e756e" }, points_awarded: 0 },
  "001031": {
    answer: { parts: { a1: "lower 29,5  and upper 39,5", a2: "30-39", a3: "1945", a4: "38,9" } },
    points_awarded: 4,
    marker_note:
      'MYP4 C B Q1: (a)(i) boundaries "29,5 and 39,5" (comma decimal) exact A1; (a)(ii) 30-39 A1; (a)(iii) weighted total 1945 M1, mean 38.9 A1. Awarded 4/10.',
  },
  "001002": { answer: { option_id: "1fd34cce-51c7-4a36-bbc2-cde08526bf96" }, points_awarded: 1 },
  "001032": {
    answer: {
      parts: {
        a1: "45",
        a2: "median is 45 and IQR is 6",
        a3: "40",
        a4: "new median 46 IQR is  8",
        b1: "summation of freaquency times midpoint over summation of frequency",
        b2: "to find the median you calculate the position by doing n+1/2  then you look fo the number a tha position. To find the IQR  you divide the data set into two equal side without considerind the median at the middle then you look for the lower quartile in the data at the left and the upper quartile for the data at the right and after you upper quanrtile -  lower quartile",
        b3: "they stay invariant because something change in the data set it changes also",
        c1: "set A: 6     Set B: 8,75",
        c2: "7,375",
        c3: "becuse the summation of all daata set in b is exact",
      },
    },
    points_awarded: 4,
    marker_note:
      "MYP4 C B Q2: (a)(i) 45 A1, Med 45 & IQR 6 A1; (a)(ii) 40 A1; (c)(i) Set A=6, Set B=8,75 (comma decimal) A1 (generic b2 definition not credited). Awarded 4/10.",
  },
  "001003": { answer: { option_id: "72f65e06-597e-4df5-a004-554f97facc58" }, points_awarded: 0 },
  "001033": {
    answer: {
      parts: {
        a2: "range before 20 range after 20 median before 124 median after 139",
        a3: "range before 20 range after 20 median before 124 median after 139",
        b1: "The error is that his data was suppose to be on a histogram not bar chat",
        b2: "The error is that his data was suppose to be on a histogram not bar chat",
        b3: "1,2--1,8--1",
      },
    },
    points_awarded: 6,
    marker_note:
      "MYP4 C B Q3: (a)(i) Complete ordered back-to-back stem-and-leaf in working.a2 (3/3); (a)(ii) After range 20 wrong (0); (b)(ii) FDs 1.2, 1.8, 1 (comma decimals) (2/2) + corrected histogram in working.b3 (1/1). Awarded 6/10.",
  },
  "001004": { answer: { option_id: "bdc630f9-66ec-4eb1-93a7-10eff990b620" }, points_awarded: 1 },
  "001034": {
    answer: {
      parts: { b3: "the clinic director should use brand with the lowest Iqr", c1: "the recommended brand is brand alpha" },
    },
    points_awarded: 1,
  },
  "001005": { answer: { option_id: "a64f9382-5cc4-4d22-920a-10ba28828ab9" }, points_awarded: 1 },
  "001006": { answer: { option_id: "39407ba6-adb4-43f9-aecd-5a022a7d2e91" }, points_awarded: 1 },
  "001007": { answer: { option_id: "0a4d47db-144c-4c83-a977-7735c9bd8b1f" }, points_awarded: 0 },
  "001008": { answer: { option_id: "f0c04f44-eb08-4717-90dc-d4eac8544b2f" }, points_awarded: 1 },
  "001009": { answer: { option_id: "234f8a10-d7b8-428e-aa32-745380827386" }, points_awarded: 1 },
  "001010": { answer: { option_id: "f7842dd1-d688-4338-bd94-de08cbadce91" }, points_awarded: 1 },
  "001011": { answer: { option_id: "8569c7f4-2c0f-4b5e-bca7-75160adc477e" }, points_awarded: 1 },
  "001012": { answer: { option_id: "3b850e0f-109b-43d2-8cb1-4feb07278d17" }, points_awarded: 0 },
  "001013": { answer: { option_id: "7ce6b068-d17c-4f76-95b6-560bf2ddf4cd" }, points_awarded: 0 },
  "001014": { answer: { option_id: "33f71eb3-8e3e-47e6-8b61-0bcfa96ed10a" }, points_awarded: 1 },
  "001015": {
    answer: {
      pairs: [
        { left: "Smooth curve plotted at upper class boundaries to estimate quartiles", right: "S" },
        { left: "Average of the squared deviations of all data values from \u03bc", right: "R" },
        { left: "Ordered display retaining every exact raw value", right: "T" },
        { left: "Quantity plotted vertically on an unequal-width histogram", right: "P" },
      ],
    },
    points_awarded: 3,
  },
  "001019": {
    answer: { parts: { a: "1440", b: "1750" } },
    points_awarded: 2,
    marker_note:
      "MYP4 C A Q19: (a) 1440 g A1; (b) computed new 7-mango total 7\u00d7250 = 1750 g M1 (omitted final subtraction 1750\u22121440 = 310 g). Awarded 2/3.",
  },
  "001020": { answer: { parts: { a1: "140", a2: "180", b1: "20", b2: "164" } }, points_awarded: 3 },
  "001021": { answer: { parts: { q1: "30", med: "60", dist: "20" } }, points_awarded: 0 },
  "001022": {
    answer: { parts: { a: "30", b1: "18 and 14", b2: "32" } },
    points_awarded: 2,
    marker_note: 'MYP4 C A Q22: (a) 30 A1; (b) outer frequencies "18 and 14" M1 (total 32 incorrect). Awarded 2/3.',
  },
  "001023": { answer: { parts: { sd: "6,83", var: "1155", mean: "169", range: "7", median: "15" } }, points_awarded: 2 },
  "001024": { answer: { parts: { iqr: "40", low: "160", out: "Yes 315", high: "280" } }, points_awarded: 2 },
  "001025": { answer: { parts: { a: "1,5", b: "15", c: "2,4", d: "12" } }, points_awarded: 4 },
  "001026": {
    answer: { parts: { k: "33", sum: "30+225 is equal to 255" } },
    points_awarded: 1,
    marker_note:
      'MYP4 C A Q26: Known sum "30+225 is equal to 255" exact A1 (auto-grader missed prose); k = 33 incorrect. Awarded 1/3.',
  },
  "001027": { answer: { parts: { sd: "7,07", mean: "21,6" } }, points_awarded: 0 },
  "001028": { answer: { parts: { sd: "7,07", mean: "21,6" } }, points_awarded: 0 },
  "001029": {
    answer: {
      parts: {
        med: "23",
        fast: "11",
        more: "the courier that is more consistent is the fast one because it has a lower median",
        express: "20",
      },
    },
    points_awarded: 2,
  },
  "001030": {
    answer: {
      parts: {
        time: "QUANTITATIVE DISCRETE  ,    HISTOGRAM",
        goals: "QUANTITATIVE CONTINUOUS  ,   HISTOGRAM   ",
        sport: "QUALITATIVE  ,    BAR GRAPH",
      },
    },
    points_awarded: 1,
  },
};

/**
 * Serialise a plain JS value as readable JS source: identifier keys stay bare,
 * everything else is quoted and escaped by JSON.stringify.
 */
function toSource(value, indent = 2) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${pad}  ${toSource(v, indent + 2)}`);
    return `[\n${items.join(",\n")},\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const items = entries.map(([k, v]) => {
      const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
      return `${pad}  ${key}: ${toSource(v, indent + 2)}`;
    });
    return `{\n${items.join(",\n")},\n${pad}}`;
  }
  return JSON.stringify(value);
}

const q = (n) => `cd000000-0000-4000-8000-000000001${n}`;

const rows = ROWS.map(([suffix, type, points, criterion, number]) => {
  const prompt = b64(PROMPT_B64[suffix]);
  const base = { id: q(suffix), type, points, criterion, number, prompt };
  if (OPTION_ROWS[suffix]) {
    return {
      ...base,
      options: OPTION_ROWS[suffix].map((_, i) => ({
        id: OPTION_IDS[suffix][i],
        label: OPTION_ROWS[suffix][i][0],
        is_correct: OPTION_ROWS[suffix][i][1],
        content_doc: optionDoc(OPTION_IDS[suffix][i]),
      })),
    };
  }
  if (PARTS[suffix]) {
    return {
      ...base,
      parts: PARTS[suffix].map(([id, label, kind, points, unit, answer, partPrompt]) => ({
        id,
        label,
        kind,
        points,
        prompt: partPrompt,
        hints: [`Re-read what ${label} is asking you to find.`, `Use the data and method named in the question for ${label}.`],
        ...(unit && unit !== "-" ? { unit } : {}),
        ...(answer !== null ? { answer } : {}),
        ...(kind === "numeric" && answer !== null ? { tolerance: 0 } : {}),
        ...(kind !== "numeric" && ACCEPTED[suffix]?.[id] ? { accepted: ACCEPTED[suffix][id] } : {}),
      })),
    };
  }
  return base;
});

const criteria = [
  { code: "A", title: "Knowing and understanding", marksAwarded: 17, marksMax: 30 },
  { code: "B", title: "Investigating patterns", marksAwarded: 5, marksMax: 20 },
  { code: "C", title: "Communicating", marksAwarded: 16, marksMax: 26 },
  { code: "D", title: "Applying mathematics in real-life contexts", marksAwarded: 8, marksMax: 24 },
];

const fixture = `/**
 * REAL MYP4 Version C submission, captured from production.
 *
 * Candidate: Melina OUSSOU \u00b7 attempt ff1cb3ba-c166-4842-af65-a44dd853b4cb
 * Stored score 61/100 (raw 46 plus the school's internal score adjustment, which
 * is never shown to students). Answer payloads, awarded marks, marker notes,
 * question prompts, part specs and option keys are transcribed verbatim from
 * Supabase so the PDF verifier renders a genuine paper, not a synthetic one.
 *
 * This is the harder of the two real fixtures to typeset: it is statistics-heavy,
 * with stem-and-leaf and table-style prompts, \`\\mu\` / \`\\sigma\` notation,
 * inequalities such as \`0 \\le t < 10\` and comma-decimal student answers
 * ("29,5", "6,83") that must not be mistaken for prose.
 *
 * Only the config keys the renderer and marker read are kept (parts, criterion,
 * question number); \`hints\` is present because the part normaliser requires it.
 */

const H = (what) => [
  \`Re-read what \${what} is asking you to find.\`,
  \`Use the data and method named in the question for \${what}.\`,
];

const part = (id, label, kind, points, prompt, extra = {}) => ({
  id,
  label,
  kind,
  points,
  prompt,
  hints: H(label),
  ...extra,
});

export const MYP4_MELINA = {
  label: "MYP4 Version C \u2014 Melina OUSSOU (real production submission)",
  exam: "cd000000-0000-4000-8000-000000000002",
  attempt: "ff1cb3ba-c166-4842-af65-a44dd853b4cb",
  student: "Melina OUSSOU",
  score: 61,
  maxScore: 100,
  quizSettings: ${JSON.stringify({ subject: "Mathematics", curriculum: "MYP 4", grade_level: "Grade 9" })},
  criteria: ${toSource(criteria, 2)},
  rows: ${toSource(rows, 2)},
  answers: ${toSource(Object.fromEntries(Object.entries(ANSWERS).map(([k, v]) => [q(k), v])), 2)},
};
`;

writeFileSync(new URL("./myp4-melina.mjs", import.meta.url), fixture);
console.log(`wrote myp4-melina.mjs \u00b7 ${rows.length} rows \u00b7 ${Object.keys(ANSWERS).length} answers`);
