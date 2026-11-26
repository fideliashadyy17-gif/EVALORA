/**
 * One-shot transcriber for the REAL MYP5 Version C submission of Oxane ZOCLI
 * (attempt d3bbe8de-4d90-4d48-a7d0-84802c4494c7), producing `myp5-oxane.mjs`.
 *
 * Every prompt, part spec, option document and saved answer below was copied
 * from Supabase. It lives in a script rather than in the fixture because the
 * raw payloads are long and base64-encoded; keeping the decode step explicit
 * makes the transcription auditable.
 *
 * Run: node scripts/real-paper-data/_gen-myp5.mjs
 */
import { writeFileSync } from "node:fs";

const b64 = (s) => Buffer.from(s, "base64").toString("utf8");

/** question_number → [question id, type, points, criterion, base64 prompt] */
const QUESTIONS = [
  ["1", "001001", "single_choice", 1, "C", "V2hpY2ggbWF0aGVtYXRpY2FsIGV4cHJlc3Npb24gZGVmaW5lcyBhIHNlcXVlbmNlICoqcmVjdXJzaXZlbHkqKj8="],
  ["1", "001031", "assess_parts", 10, "A", "KipUQVNLIDEgwrcgQ1JJVEVSSU9OIEEg4oCUIEtub3dpbmcgYW5kIHVuZGVyc3RhbmRpbmcgWzEwIG1hcmtzXSoqCioqMS4gSW50ZXJzZWN0aW5nIHNlcXVlbmNlcyAmIHNlcmllcyBbMTAgbWtzXSoqCkFyaXRobWV0aWMgc2VxdWVuY2UgJEFfbiQgYW5kIGdlb21ldHJpYyBzZXF1ZW5jZSAkR19uJCBhcmUgcGxvdHRlZCBmb3IgJG4gPSAxLi41JCwgbWVldGluZyBhdCAoNCwgMjQpLgoKW0ZpZ3VyZTogQXJpdGhtZXRpYyBBX24gYW5kIGdlb21ldHJpYyBHX25dCioqKGEpKiogKipEZXJpdmUqKiBzaW1wbGlmaWVkIGV4cGxpY2l0IGZvcm11bGFzIGZvciAkQV9uJCBhbmQgJEdfbiQgZnJvbSB0aGUgZ3JhcGgsIGFuZCAqKnZlcmlmeSoqIGFsZ2VicmFpY2FsbHkgdGhhdCAkQV80ID0gR180ID0gMjQkLiBbNF0KKiooYikqKiAqKkZpbmQqKiB0aGUgdGVybSBudW1iZXIgJG4kIGFuZCB2YWx1ZSBvZiB0aGUgZmlyc3QgbmVnYXRpdmUgdGVybSBvZiAkQV9uJCwgYW5kICoqZXZhbHVhdGUqKiB0aGUgYXJpdGhtZXRpYyBzdW0gJFNfezIwfSQgb2YgJEFfbiQuIFszXQoqKihjKSoqICoqRXZhbHVhdGUqKiB0aGUgZXhhY3QgZ2VvbWV0cmljIHN1bSAkU197MTB9JCBvZiAkR19uJCwgYW5kICoqZmluZCoqIHRoZSBzbWFsbGVzdCBpbnRlZ2VyICRuJCBmb3Igd2hpY2ggJEdfbiA+IDEgNTAwJC4gWzNd"],
  ["2", "001002", "single_choice", 1, "A", "QSBzZXF1ZW5jZSBoYXMgZXhwbGljaXQgZm9ybXVsYSAkdV9uID0gMm5eMiArIDNuIC0gNSQuICoqQ2FsY3VsYXRlKiogJHVfNiQu"],
  ["2", "001032", "assess_parts", 10, "B", "KipUQVNLIDIgwrcgQ1JJVEVSSU9OIEIg4oCUIEludmVzdGlnYXRpbmcgcGF0dGVybnMgWzEwIG1hcmtzXSoqCioqMi4gQ291cnR5YXJkIHRpbGUgcGF0dGVybiAmIHF1YWRyYXRpYyBncm93dGggWzEwIG1rc10qKiBTdGFnZSAkbiQgaGFzIGFuICRuIFx0aW1lcyAobisxKSQgZ3JlZW4gY29yZSAoJENfbiQpIGJvcmRlcmVkIHRvcCBhbmQgYm90dG9tIGJ5IHJvd3Mgb2YgJChuKzEpJCBwYWxlIHRpbGVzICgkQl9uJCksIGdpdmluZyB0b3RhbCB0aWxlcyAkVF9uID0gQ19uICsgQl9uJC4KCltGaWd1cmU6IENvdXJ0eWFyZCB0aWxlIHBhdHRlcm5zOiBwYWxlIHJvd3MgYWJvdmUgYW5kIGJlbG93IHRoZSBncmVlbiBjb3JlXQoqKihhKSoqICoqVGFidWxhdGUqKiAkQl9uJCwgJENfbiQgYW5kICRUX24kIGZvciAkMSBcbGUgbiBcbGUgNSQsIGFuZCB1c2UgZmlyc3QgYW5kIHNlY29uZCBkaWZmZXJlbmNlcyB0byAqKmNsYXNzaWZ5KiogJEJfbiQgYW5kICRUX24kLiBbNF0KKiooYikqKiAqKldyaXRlKiogZXhwYW5kZWQgZXhwbGljaXQgZm9ybXVsYXMgZm9yICRCX24kLCAkQ19uJCBhbmQgJFRfbiQgaW4gdGVybXMgb2YgJG4kLCBhbmQgKipzdGF0ZSoqIHRoZSBzdGFnZSB3aGVyZSAkQ19uID0gQl9uJC4gWzNdCioqKGMpKiogKipGb3JtIGFuZCBzb2x2ZSoqIGEgcXVhZHJhdGljIGVxdWF0aW9uIHRvIGZpbmQgd2hpY2ggc3RhZ2UgcmVxdWlyZXMgZXhhY3RseSAkVF9uID0gMjEwJCB0aWxlcy4gWzNd"],
  ["3", "001003", "single_choice", 1, "A", "Rm9yIHRoZSBhcml0aG1ldGljIHNlcXVlbmNlIDQyLCAzNSwgMjgsIDIxLCDigKYsICoqc3RhdGUqKiAkZCQgYW5kICR1X3sxMH0kLg=="],
  ["3", "001033", "assess_parts", 10, "C", "KipUQVNLIDMgwrcgQ1JJVEVSSU9OIEMg4oCUIENvbW11bmljYXRpbmcgWzEwIG1hcmtzXSoqCioqMy4gR3JhcGhpY2FsICYgc3ltYm9saWMgc2VxdWVuY2UgY29tbXVuaWNhdGlvbiBbMTAgbWtzXSoqIERpc2NyZXRlIHNlcXVlbmNlcyAkUF9uJCAo4oiSMjQsIDEyLCDiiJI2LCAzLCDiiJIxLjUpIGFuZCAkUl9uJCAoOSwgNCwgMSwgMCwgMSkgYXJlIHBsb3R0ZWQgYmVsb3c6CgpbRmlndXJlOiBQYW5lbCBJIChQX24pXQoKW0ZpZ3VyZTogUGFuZWwgSUkgKFJfbildCioqKGEpKiogKipDbGFzc2lmeSoqIFBhbmVsIEkgKCRQX24kKSBhbmQgUGFuZWwgSUkgKCRSX24kKSwgY2l0aW5nIG9uZSBkaXN0aW5jdCB2aXN1YWwgZmVhdHVyZSBmcm9tIGVhY2ggY29vcmRpbmF0ZSBncmFwaC4gWzNdCioqKGIpKiogVXNpbmcgcHJvcGVyIHN1YnNjcmlwdCBub3RhdGlvbiwgKipzdGF0ZSoqIGJvdGggYW4gZXhwbGljaXQgZm9ybXVsYSBhbmQgYSBjb21wbGV0ZSByZWN1cnNpdmUgZGVmaW5pdGlvbiAod2l0aCBpbml0aWFsIHRlcm0pIGZvciAkUF9uJCBhbmQgJFJfbiQuIFs0XQoqKihjKSoqIFRvIHN1bSAkOCArIDEzICsgMTggKyBcbGRvdHMgKyA5MyQsIE1hbGlrIHdyaXRlcyAkbiA9IFxmcmFjezkzLTh9ezV9ID0gMTckIGFuZCAkU197MTd9ID0gODU4LjUkOyB0byBzdW0gNiB0ZXJtcyBvZiAkNSArIDEwICsgMjAgKyBcbGRvdHMkLCBBbWluYSB3cml0ZXMgJFNfNiA9IFxmcmFjezUoMS0yXjUpfXsxLTJ9ID0gMTU1JC4gKipFeHBsYWluKiogZWFjaCBzdHVkZW50J3MgZXJyb3IgYW5kICoqY29tcHV0ZSoqIGJvdGggY29ycmVjdCBzdW1zLiBbM10="],
  ["4", "001004", "single_choice", 1, "A", "VGhlIGNvb3JkaW5hdGUgZ3JhcGggc2hvd3MgdGhlIGZpcnN0IGZpdmUgdGVybXMgb2YgYSBsaW5lYXIgc2VxdWVuY2UgJHVfbiQuICoqSWRlbnRpZnkqKiBpdHMgZXhwbGljaXQgZm9ybXVsYS4KCltGaWd1cmU6IEZpcnN0IGZpdmUgdGVybXMgb2YgYSBsaW5lYXIgc2VxdWVuY2Vd"],
  ["4", "001034", "assess_parts", 10, "D", "KipUQVNLIDQgwrcgQ1JJVEVSSU9OIEQg4oCUIEFwcGx5aW5nIGluIHJlYWwtbGlmZSBjb250ZXh0cyBbMTAgbWFya3NdKioKKio0LiBDb3Rvbm91IHBvcnQgY29sZC1zdG9yYWdlIHNvbGFyIGFycmF5ICYgc2VydmljZSBwbGFucyBbMTAgbWtzXSoqIEEgUG9ydCBvZiBDb3Rvbm91IGNvbGQtc3RvcmFnZSBmYWNpbGl0eSBnZW5lcmF0ZXMgNjAwIE1XaCBvZiBzb2xhciBlbGVjdHJpY2l0eSBpbiBZZWFyIDEsIGRlY2xpbmluZyBieSA0JSBwZXIgeWVhci4KKiooYSkqKiAqKlN0YXRlKiogdGhlIGdlb21ldHJpYyByYXRpbyAkciQsICoqY2FsY3VsYXRlKiogWWVhciA2IG91dHB1dCAkRV82JCAoMSBkLnAuKSwgYW5kICoqY29tcHV0ZSoqIDEwLXllYXIgY3VtdWxhdGl2ZSBvdXRwdXQgJFNfezEwfSQgKDEgZC5wLikgYWdhaW5zdCBhIDUgMDAwIE1XaCB0YXJnZXQuIFs0XQoqKihiKSoqIFR3byA2LXllYXIgbWFpbnRlbmFuY2UgY29udHJhY3RzIGFyZSBvZmZlcmVkOiAqKk9wdGlvbiBYKiogY29zdHMgMzAwIDAwMCBGQ0ZBIGluIFllYXIgMSAoKzQwIDAwMCBGQ0ZBL3lyKTsgKipPcHRpb24gWSoqIGNvc3RzIDIyMCAwMDAgRkNGQSBpbiBZZWFyIDEgKCsyNSUveXIsIHIgPSAxLjI1KS4gKipDYWxjdWxhdGUqKiAkU182JCBmb3IgYm90aCBvcHRpb25zIChuZWFyZXN0IEZDRkEpLiBbNF0KKiooYykqKiAqKkNvbXBhcmUqKiAzLXllYXIgdG90YWxzICgkU18zJCkgdmVyc3VzIDYteWVhciB0b3RhbHMgKCRTXzYkKSBhbmQgKipyZWNvbW1lbmQqKiB0aGUgbG93ZXItY29zdCBvcHRpb24gZm9yIGVhY2ggaG9yaXpvbi4gWzJd"],
  ["5", "001005", "single_choice", 1, "A", "Rm9yIHRoZSBnZW9tZXRyaWMgc2VxdWVuY2UgMTI4LCDiiJI2NCwgMzIsIOKIkjE2LCDigKYsICoqZmluZCoqICRyJCBhbmQgJHVfNiQu"],
  ["6", "001006", "single_choice", 1, "B", "SG93IGlzIHRoZSBzZXF1ZW5jZSA1LCA5LCAxNywgMjksIDQ1LCDigKYgYmVzdCAqKmNsYXNzaWZpZWQqKj8="],
  ["7", "001007", "single_choice", 1, "B", "V2hpY2ggZXhwbGljaXQgZm9ybXVsYSAqKmdlbmVyYXRlcyoqIHRoZSBzZXF1ZW5jZSAkXGZyYWMxMywgXGZyYWMyNSwgXGZyYWMzNywgXGZyYWM0OSwgXGxkb3RzJD8="],
  ["8", "001008", "single_choice", 1, "D", "QW4gYXVkaXRvcml1bSBoYXMgMTggc2VhdHMgaW4gUm93IDEgYW5kIDI2IHNlYXRzIGluIFJvdyA5LCBpbmNyZWFzaW5nIGFyaXRobWV0aWNhbGx5IGJ5IHJvdy4gKipGaW5kKiogdGhlIHRvdGFsIHNlYXRzICRTXzkkLg=="],
  ["9", "001009", "single_choice", 2, "B", "VGhlIGRpZmZlcmVuY2UgdGFibGUgYmVsb3cgcmVwcmVzZW50cyBhIHF1YWRyYXRpYyBzZXF1ZW5jZSAkdV9uID0gYW5eMiArIGJuICsgYyQ6IFsyXQpUZXJtIG4KIHwgMQogfCAyCiB8IDMKIHwgNAogfCA1CgpWYWx1ZSAkdV9uJAogfCA0CiB8IDExCiB8IDI0CiB8IDQzCiB8ICRrJAoKMXN0IGRpZmYuICRcRGVsdGFeMSQKIHwgKzcKIHwgKzEzCiB8ICsxOQogfCAkcCQKIHwg4oCUCgoybmQgZGlmZi4gJFxEZWx0YV4yJAogfCAKIHwgKzYKIHwgKzYKIHwgKGNvbnN0YW50KQogfCAKCioqRmluZCoqIHRoZSBsZWFkaW5nIGNvZWZmaWNpZW50ICRhJCBhbmQgZmlmdGggdGVybSAkayQu"],
  ["10", "001010", "single_choice", 2, "C", "VGhlIGdyYXBoIGRpc3BsYXlzIHRoZSBmaXJzdCBmb3VyIHRlcm1zIG9mIGEgZ2VvbWV0cmljIHNlcXVlbmNlLiAqKkNob29zZSoqIGl0cyBleHBsaWNpdCBydWxlIGFuZCBleGFjdCBmaWZ0aCB0ZXJtICR1XzUkLiBbMl0KCltGaWd1cmU6IEZpcnN0IGZvdXIgdGVybXMgb2YgYSBnZW9tZXRyaWMgc2VxdWVuY2Vd"],
  ["11", "001011", "single_choice", 2, "A", "R2l2ZW4gJHVfMSA9IDUkIGFuZCAkdV97bisxfSA9IDJ1X24gLSAzJCAkKG4gXGdlIDEpJCwgKipjYWxjdWxhdGUqKiAkdV81JC4gWzJd"],
  ["12", "001012", "assess_parts", 2, "A", "QXJpdGhtZXRpYyBzZXF1ZW5jZSB3aXRoICR1XzQgPSAyMyQgYW5kICR1X3sxMX0gPSA2NSQ6IFsyXQoqKihpKSAkZCA9JCoqICAgKiooaWkpICR1X3syNX0gPSQqKg=="],
  ["13", "001013", "single_choice", 2, "A", "KipDYWxjdWxhdGUqKiB0aGUgc3VtICRTX3sxNX0kIG9mIHRoZSBmaXJzdCAxNSB0ZXJtcyBvZiB0aGUgYXJpdGhtZXRpYyBzZXJpZXMgOSArIDEzICsgMTcgKyAyMSArIOKApiBbMl0="],
  ["14", "001014", "single_choice", 2, "D", "TGFiIGVxdWlwbWVudCB3b3J0aCAkMjUgMDAwIGluIFllYXIgMSByZXRhaW5zIDgwJSBvZiBpdHMgdmFsdWUgZWFjaCB5ZWFyICgkVl9uID0gMjUgMDAwKDAuOClee24tMX0kKS4gKipGaW5kKiogaXRzIFllYXIgNCB2YWx1ZSAkVl80JC4gWzJd"],
  ["15", "001015", "assess_parts", 3, "B", "QSBzZXF1ZW5jZSBzYXRpc2ZpZXMgJHVfMSA9IDEkIGFuZCAkdV97bisxfSA9IHVfbiArIDJuICsgMSQgJChuIFxnZSAxKSQuIFszXQoqKihpKSoqICoqUGxvdCoqICQoMywgdV8zKSQgYW5kICQoNCwgdV80KSQgb24gdGhlIGdyaWQuCioqKGlpKSBFeHBsaWNpdCBydWxlOioqICR1X24gPSQgX19fX19f"],
  ["16", "001016", "assess_parts", 3, "C", "TGluZWFyICRMX24gPSAzbiArIDMkIGFuZCBxdWFkcmF0aWMgJFFfbiA9IG5eMiAtIG4gKyA2JCBhcmUgcGxvdHRlZCB0b2dldGhlci4gWzNdCgpbRmlndXJlOiBMaW5lYXIgYW5kIHF1YWRyYXRpYyBzZXF1ZW5jZXNdCioqKGkpIEJvdGggaW50ZXJzZWN0aW9uIHBvaW50czoqKiBfX19fX18KKiooaWkpICRRXzUgLSBMXzUgPSQqKiBfX19fX18="],
  ["17", "001017", "assess_parts", 3, "A", "UG9zaXRpdmUgZ2VvbWV0cmljIHNlcXVlbmNlIHdpdGggJHVfMiA9IDEyJCBhbmQgJHVfNSA9IDMyNCQ6IFszXQoqKihpKSAkciA9JCoqIF9fX19fXyAgICoqJHVfMSA9JCoqIF9fX19fXyAgICoqKGlpKSBTdW0gJFNfNSA9JCoqIF9fX19fXw=="],
  ["18", "001018", "assess_parts", 3, "D", "Q3VtdWxhdGl2ZSBmbG91ciBiYWdzICRTX24kIHVzZWQgYnkgYSBDb3Rvbm91IGJha2VyeSBvdmVyIFdlZWtzIDHigJM0ICh3ZWVrbHkgdXNhZ2UgaXMgYXJpdGhtZXRpYykuIFszXQoKW0ZpZ3VyZTogQ3VtdWxhdGl2ZSBmbG91ciBiYWdzIHVzZWRdCioqKGkpIFdlZWsgNCB1c2FnZSAkdV80ID0kKiogX19fX19fICAgKiooaWkpICRkID0kKiogX19fX19fICoqOyoqICoqJFNfOCA9JCoqIF9fX19fXw=="],
  ["19", "001019", "assess_parts", 3, "A", "UXVhZHJhdGljIHJ1bGUgJHVfbiA9IDJuXjIgLSA3biArIDkkOiBbM10KKiooaSkqKiAkdV8xID0kIF9fX19fXyAqKiwgJHVfNSA9JCoqIF9fX19fXyAgICoqKGlpKSBTb2x2ZSAkdV9uID0gODEkOiAkbiA9JCoqIF9fX19fXw=="],
  ["20", "001020", "single_choice", 2, "A", "KipGaW5kKiogdGhlIGV4YWN0IHN1bSAkU182JCBvZiB0aGUgZmlyc3QgNiB0ZXJtcyBvZiB0aGUgZ2VvbWV0cmljIHNlcmllcyAzMiArIDQ4ICsgNzIgKyAxMDggKyDigKYgWzJd"],
  ["21", "001021", "single_choice", 2, "A", "Q29uc2VjdXRpdmUgcG9zaXRpdmUgdGVybXMgJGstMiQsICRrKzQkLCAkM2skIGZvcm0gYSBnZW9tZXRyaWMgc2VxdWVuY2UuICoqRmluZCoqICRrJCBhbmQgY29tbW9uIHJhdGlvICRyJC4gWzJd"],
  ["22", "001022", "single_choice", 2, "A", "KipIb3cgbWFueSB0ZXJtcyoqIGFyZSBpbiB0aGUgYWx0ZXJuYXRpbmcgZ2VvbWV0cmljIHNlcmllcyAkMjQzIC0gMTYyICsgMTA4IC0gXGxkb3RzIC0gMzIkPyBbMl0="],
  ["23", "001023", "assess_parts", 3, "B", "KipDb21wbGV0ZSoqIHRoZSBzZXF1ZW5jZSBjbGFzc2lmaWNhdGlvbiAmIGZpZnRoLXRlcm0gdGFibGU6IFszXQpGaXJzdCBmb3VyIHRlcm1zCiB8IFR5cGUgKEFyaXRoLiAvIEdlb20uIC8gUXVhZC4pCiB8IEV4YWN0ICR1XzUkCgozMCwgMjMsIDE2LCA5LCDigKYKIHwgX19fX19fX18KIHwgX19fX19fX18KCjUsIDEwLCAyMCwgNDAsIOKApgogfCBfX19fX19fXwogfCBfX19fX19fXwoKMiwgNywgMTYsIDI5LCDigKYKIHwgX19fX19fX18KIHwgX19fX19fX18="],
  ["24", "001024", "single_choice", 2, "B", "VGhlIGdyYXBoIHBsb3RzIHRoZSBmaXJzdCBkaWZmZXJlbmNlcyAkXERlbHRhX24gPSB1X3tuKzF9IC0gdV9uJCBvZiBhIHNlcXVlbmNlIHdpdGggJHVfMSA9IDMkLiBbMl0KCltGaWd1cmU6IEZpcnN0IGRpZmZlcmVuY2VzIG9mIGEgc2VxdWVuY2VdCioqQ2xhc3NpZnkqKiAkdV9uJCBhbmQgKipmaW5kKiogJHVfNCQu"],
  ["25", "001025", "single_choice", 2, "B", "R2l2ZW4gJHVfMSA9IDQkIGFuZCAkdV97bisxfSA9IDN1X24gLSAyJCAkKG4gXGdlIDEpJCwgd2hlcmUgJHdfbiA9IHVfbiAtIDEkIGlzIGdlb21ldHJpYywgKippZGVudGlmeSoqIHRoZSBleHBsaWNpdCBmb3JtdWxhIGZvciAkdV9uJC4gWzJd"],
  ["26", "001026", "single_choice", 2, "C", "V2hpY2ggcmVjdXJzaXZlIGRlZmluaXRpb24gKipnZW5lcmF0ZXMqKiB0aGUgc2VxdWVuY2Ugd2l0aCBleHBsaWNpdCBydWxlICR1X24gPSA3biAtIDQkICQobiBcZ2UgMSkkPyBbMl0="],
  ["27", "001027", "assess_parts", 2, "C", "KipSZXdyaXRlKiogJHVfbiA9IDEyXGxlZnQoXGZyYWMxMlxyaWdodClee24tMX0kICQobiBcZ2UgMSkkIGFzIGEgcmVjdXJzaXZlIHJ1bGU6IFsyXQokdV8xID0kIF9fX19fXyAsICR1X3tuKzF9ID0kIF9fX19fXyAkKG4gXGdlIDEpJA=="],
  ["28", "001028", "assess_parts", 3, "D", "QSBQb3J0by1Ob3ZvIGNvb3BlcmF0aXZlIHdlYXZlcyA1NiBiYXNrZXRzIGluIE1vbnRoIDEgKCs4IGJhc2tldHMvbW9udGgpLiBbM10KKiooaSkgTW9udGggMTA6ICR1X3sxMH0gPSQqKiBfX19fX18gICAqKihpaSkgTW9udGhzIGZvciAkU19uID0gNzkyJDogJG4gPSQqKiBfX19fX18="],
  ["29", "001029", "single_choice", 2, "D", "S29maSBpbnZlc3RzIDEwMCAwMDAgRkNGQSBhdCB0aGUgKipzdGFydCoqIG9mIGVhY2ggeWVhciBmb3IgNSB5ZWFycyBhdCA2JSBjb21wb3VuZCBpbnRlcmVzdCBwLmEuICoqRmluZCoqIHRoZSBlbmQtb2YtWWVhci01IGJhbGFuY2UuIFsyXQ=="],
  ["30", "001030", "assess_parts", 3, "D", "QSBCb2hpY29uIHBsYW50IGZpbHRlcnMgJFZfbiQgbcKzIGluIG1vbnRoICRuJCAoZ2VvbWV0cmljIGRlY2F5KS4gWzNdCgpbRmlndXJlOiBNb250aGx5IGZpbHRyYXRpb24gdm9sdW1lXQoqKihpKSAkciA9JCoqIF9fX19fXyAqKjsgJFZfNiA9JCoqIF9fX19fXyAgICoqKGlpKSAkU182JCAobmVhcmVzdCBtwrMpID0qKiBfX19fX18="],
];

/** question_number → parts [id, label, kind, points, unit, answer, prompt] */
/**
 * Accepted answers transcribed from production for the text/expression parts
 * (numeric parts carry `answer` instead). Without them a part is not markable
 * and the display projection would drop it.
 */
const ACCEPTED = {
  "12": {
  },
  "15": {
    rule: ["n^2", "n\u00b2"],
  },
  "16": {
    i1: ["(1, 6)", "1, 6", "n=1, y=6"],
    i2: ["(3, 12)", "3, 12", "n=3, y=12"],
  },
  "17": {
  },
  "18": {
  },
  "19": {
    terms: ["4 and 24", "4, 24", "u1=4, u5=24"],
  },
  "23": {
    r1: ["Arithmetic, 2", "Arithmetic; 2", "Arithmetic u5=2"],
    r2: ["Geometric, 80", "Geometric; 80", "Geometric u5=80"],
    r3: ["Quadratic, 46", "Quadratic; 46", "Quadratic u5=46"],
  },
  "27": {
    rule: ["(1/2)u_n", "1/2*u_n", "0.5u_n", "u_n/2", "1/2 u_n", "0.5*u_n"],
  },
  "28": {
  },
  "30": {
  },
  "31": {
    a1: ["40-4n", "36-4(n-1)"],
    a2: ["3*2^(n-1)", "3(2)^(n-1)", "3\u00d72^(n-1)"],
    a3: ["A4 = 40 - 16 = 24 and G4 = 3 \u00d7 2^3 = 24", "A4=24, G4=3(8)=24"],
    a4: ["d = -4 from (1,36) and (4,24); r = 2 from (1,3) and (4,24)", "A_n has d=-4 and G_n has r=2"],
    b1: ["n=11, A11=-4", "11 and -4", "A11 = -4"],
    b3: ["40 - 4n < 0 gives n > 10; S20 = 20/2(36 + (-40)) = -40", "n>10 and S20=10(-4)"],
    c3: ["2^(n-1) > 500, and 2^9 = 512, so n = 10", "n-1=9 therefore n=10"],
  },
  "32": {
    a1: ["4, 6, 8, 10, 12"],
    a2: ["C: 2, 6, 12, 20, 30; T: 6, 12, 20, 30, 42", "2,6,12,20,30 and 6,12,20,30,42"],
    a3: ["Linear/arithmetic, constant first difference 2"],
    a4: ["Quadratic, first differences 6,8,10,12 and constant second difference 2"],
    b1: ["B_n=2n+2, C_n=n^2+n, T_n=n^2+3n+2", "(2n+2, n^2+n, n^2+3n+2)"],
    b2: ["n^2+n", "n(n+1)"],
    c1: ["n^2+3n-208=0", "n^2+3n+2=210"],
  },
  "33": {
    a1: ["Alternating geometric; points alternate above and below the n-axis while halving", "Geometric with r=-1/2; the points alternate signs and halve"],
    a2: ["Quadratic; U-shaped parabola with minimum vertex (4,0) and symmetry R3=R5", "Quadratic; points form a parabola with vertex at (4,0)"],
    a3: ["P_n alternates in sign and halves; R_n has a minimum at (4,0)", "The geometric terms approach zero and alternate; the quadratic is symmetric about n=4"],
    b1: ["-24(-1/2)^(n-1)", "-24*(-0.5)^(n-1)"],
    b2: ["P1=-24, Pn+1=(-1/2)Pn", "P_1 = -24, P_{n+1} = -0.5 P_n"],
    b3: ["(n-4)^2", "n^2-8n+16"],
    b4: ["R1=9, Rn+1=Rn+2n-7", "R_1 = 9, R_{n+1} = R_n + 2n - 7"],
    c1: ["He omitted +1 when counting terms; there are 18 terms, not 17", "n-1=17 so n=18 terms"],
    c3: ["She used exponent 5 instead of 6; S6 = 5(2^6-1) = 315", "The exponent must be n=6; correct sum 315"],
  },
  "34": {
    rec: ["Option Y for 3 years and Option X for 6 years", "Choose Y for 3 years (saves 181 250) and X for 6 years (saves 76 934)"],
    s3: ["X = 1 020 000 FCFA; Y = 838 750 FCFA", "X 1 020 000, Y 838 750"],
    target: ["Yes, 5 027.5 MWh exceeds 5 000 MWh by 27.5 MWh", "Yes \u2014 target met with a 27.5 MWh surplus"],
  },
};

const PARTS = {
  "1": [
    ["a1", "(a) A_n", "expression", 1, "-", null, "Simplified explicit formula for A_n"],
    ["a2", "(a) G_n", "expression", 1, "-", null, "Simplified explicit formula for G_n"],
    ["a3", "(a) verification", "text", 1, "-", null, "Verification that A4 = G4 = 24"],
    ["a4", "(a) derivation", "text", 1, "-", null, "Working that derives the common difference and ratio from the graph"],
    ["b1", "(b) first negative", "text", 1, "-", null, "Term number and value of the first negative term of A_n"],
    ["b2", "(b) S20", "numeric", 1, "-", -40, "Arithmetic sum S20"],
    ["b3", "(b) method", "text", 1, "-", null, "Method: solve 40 - 4n < 0 and substitute into the sum formula"],
    ["c1", "(c) S10", "numeric", 1, "-", 3069, "Exact geometric sum S10"],
    ["c2", "(c) threshold", "numeric", 1, "-", 10, "Smallest integer n for which G_n > 1500"],
    ["c3", "(c) method", "text", 1, "-", null, "Method: solve 3 \u00d7 2^(n-1) > 1500 using powers of 2"],
  ],
  "2": [
    ["a1", "(a) B_n", "text", 1, "-", null, "Values of B_n for n = 1 to 5"],
    ["a2", "(a) C_n and T_n", "text", 1, "-", null, "Values of C_n and T_n for n = 1 to 5"],
    ["a3", "(a) B_n classification", "text", 1, "-", null, "Classify B_n using differences"],
    ["a4", "(a) T_n classification", "text", 1, "-", null, "Classify T_n using differences"],
    ["b1", "(b) formulas", "expression", 1, "-", null, "Expanded explicit formulas for B_n, C_n and T_n"],
    ["b2", "(b) C_n formula", "expression", 1, "-", null, "Expanded formula for C_n"],
    ["b3", "(b) equality", "numeric", 1, "-", 2, "Stage where C_n = B_n"],
    ["c1", "(c) equation", "expression", 1, "-", null, "Quadratic equation formed from T_n = 210"],
    ["c2", "(c) stage", "numeric", 2, "-", 13, "Stage requiring exactly 210 tiles"],
  ],
  "3": [
    ["a1", "(a) P_n", "text", 1, "-", null, "Classification of P_n and one distinct visual feature"],
    ["a2", "(a) R_n", "text", 1, "-", null, "Classification of R_n and one distinct visual feature"],
    ["a3", "(a) feature", "text", 1, "-", null, "A second distinct visual feature supporting the classifications"],
    ["b1", "(b) P explicit", "expression", 1, "-", null, "Explicit formula for P_n"],
    ["b2", "(b) P recursive", "text", 1, "-", null, "Recursive definition for P_n with initial term"],
    ["b3", "(b) R explicit", "expression", 1, "-", null, "Explicit formula for R_n"],
    ["b4", "(b) R recursive", "text", 1, "-", null, "Recursive definition for R_n with initial term"],
    ["c1", "(c) Malik error", "text", 1, "-", null, "Malik's error"],
    ["c2", "(c) Malik sum", "numeric", 1, "-", 909, "Correct arithmetic sum"],
    ["c3", "(c) Amina", "text", 1, "-", null, "Amina's error and the correct geometric sum"],
  ],
  "4": [
    ["r", "(a) ratio", "numeric", 1, "-", 0.96, "Geometric ratio r"],
    ["e6", "(a) E6", "numeric", 1, "MWh", 489.2, "Year 6 output (1 d.p.)"],
    ["s10", "(a) S10", "numeric", 1, "MWh", 5027.5, "10-year cumulative output (1 d.p.)"],
    ["target", "(a) target", "text", 1, "-", null, "Does the 10-year output meet the 5 000 MWh target?"],
    ["x", "(b) X", "numeric", 2, "FCFA", 2400000, "Six-year total for Option X (nearest FCFA)"],
    ["y", "(b) Y", "numeric", 2, "FCFA", 2476934, "Six-year total for Option Y (nearest FCFA)"],
    ["s3", "(c) S3", "text", 1, "-", null, "Three-year totals for both options (nearest FCFA)"],
    ["rec", "(c) recommendation", "text", 1, "-", null, "Recommendation for each horizon"],
  ],
  "12": [
    ["d", "(i)", "numeric", 1, "-", 6, "Common difference d"],
    ["u25", "(ii)", "numeric", 1, "-", 149, "Twenty-fifth term"],
  ],
  "15": [
    ["rule", "(ii)", "expression", 1, "-", null, "Explicit rule for the sequence, and plot the two required points in the working space"],
  ],
  "16": [
    ["i1", "(i) first", "text", 1, "-", null, "First intersection point"],
    ["i2", "(i) second", "text", 1, "-", null, "Second intersection point"],
    ["diff", "(ii)", "numeric", 1, "-", 8, "Value of Q5 \u2212 L5"],
  ],
  "17": [
    ["r", "(i) r", "numeric", 1, "-", 3, "Common ratio r"],
    ["u1", "(i) u1", "numeric", 1, "-", 4, "First term u1"],
    ["s5", "(ii)", "numeric", 1, "-", 484, "Sum of the first five terms"],
  ],
  "18": [
    ["u4", "(i)", "numeric", 1, "bags", 30, "Week 4 usage"],
    ["d", "(ii) d", "numeric", 1, "bags", 4, "Common difference"],
    ["s8", "(ii) S8", "numeric", 1, "bags", 256, "Total usage over 8 weeks"],
  ],
  "19": [
    ["terms", "(i)", "text", 1, "-", null, "Values of u1 and u5"],
    ["solve", "(ii)", "numeric", 2, "-", 8, "Positive integer n for which u_n = 81"],
  ],
  "23": [
    ["r1", "Row 1", "text", 1, "-", null, "Type and fifth term for 30, 23, 16, 9, \u2026"],
    ["r2", "Row 2", "text", 1, "-", null, "Type and fifth term for 5, 10, 20, 40, \u2026"],
    ["r3", "Row 3", "text", 1, "-", null, "Type and fifth term for 2, 7, 16, 29, \u2026"],
  ],
  "27": [
    ["u1", "u1", "numeric", 1, "-", 12, "Initial term"],
    ["rule", "un+1", "expression", 1, "-", null, "Recursive rule in terms of u_n"],
  ],
  "28": [
    ["u10", "(i)", "numeric", 1, "baskets", 128, "Month 10 production"],
    ["n", "(ii)", "numeric", 2, "months", 9, "Number of months for a total of 792 baskets"],
  ],
  "30": [
    ["r", "(i) r", "numeric", 1, "-", 0.9, "Common ratio"],
    ["v6", "(i) V6", "numeric", 1, "m\u00b3", 236.2, "Volume in month 6 (1 d.p.)"],
    ["s6", "(ii)", "numeric", 1, "m\u00b3", 1874, "Total volume over 6 months (nearest m\u00b3)"],
  ],
};

/** question_number → [option id, correct?] in presented order (from o.position) */
const OPTIONS = {
  "1": [
    ["98e8945b-6e89-4ec7-9dae-d876a2a90a3b", false],
    ["9e169931-aa7f-407f-825d-90432f497904", false],
    ["64122afc-8df0-45d6-834d-287715938bbb", true],
    ["80f0a745-1c51-4a5c-9c52-659ebab1eb48", false],
  ],
  "2": [
    ["323bd4a6-7fe0-46a6-b970-9d93a6cd437d", false],
    ["fb9cf1e3-ffb1-4040-9ed4-34d34ee80d2b", true],
    ["90202145-c985-43ba-bcc9-c4f0a491ade9", false],
    ["cebbac34-6d12-4265-9ce1-8a6fc1b62885", false],
  ],
  "3": [
    ["752d3bcb-49c5-4980-8190-df4914deaa0c", true],
    ["b2bd0bd4-7b00-4168-88a3-e3f93123eee9", false],
    ["164122cb-a03e-4a9e-a64a-4f2090baab18", false],
    ["30cff300-1d64-4c42-9bc0-47468e91cefb", false],
  ],
  "4": [
    ["c2867ff6-6d73-4a0c-8490-56e9009f8497", false],
    ["0f97f4cb-b7fb-4e13-80d2-a7d4fbcc7e1b", false],
    ["b435f108-4a26-4884-a6e7-25aa67fe9603", true],
    ["1b9db58f-79f9-4a87-b699-0dc2dd56c9c8", false],
  ],
  "5": [
    ["0e2d2d1d-4f9c-4962-9d4d-214b8db60474", false],
    ["82bc8b59-360e-49b8-bdd9-1e6c14905b52", true],
    ["7b469b12-a549-4f55-b313-c79015cf8127", false],
    ["1a93076b-2e4c-4c8f-9268-347c05441088", false],
  ],
  "6": [
    ["5d32638c-ff5e-43dc-afe2-a52137b4ed6f", false],
    ["29e1dfaf-91fb-4dff-926f-964c63c29aa0", false],
    ["3bfb9367-114e-4781-8f92-1f8c61a65bc8", true],
    ["699c622e-fb9e-4087-b35d-8ac6c443da11", false],
  ],
  "7": [
    ["e58b1b26-5f17-43bc-b4d6-a62eaa117cb2", false],
    ["b8cbbb22-ce2c-4161-922c-da9529636965", true],
    ["20050fd8-fa84-47bd-bedf-d709e89bda99", false],
    ["c5a3f513-368a-485a-8d72-683b9b51f3ef", false],
  ],
  "8": [
    ["943283e0-5829-421d-afd7-4ccf57bb5f4e", false],
    ["50d11682-b1ac-40b2-9477-27250f763b47", false],
    ["d57246c7-9a8b-4d45-8903-277955ae1174", true],
    ["e3edc570-4168-4375-8ce1-d1b455a91b40", false],
  ],
  "9": [
    ["f45a6c46-0396-44f3-b08d-e7b71891df38", true],
    ["fdc708fa-fa83-474e-a972-8f15fabfa961", false],
    ["bd56ef54-9760-47b6-977f-66b5b417dd73", false],
    ["159bbee1-0ce1-4b4c-af4b-acbe24ca811d", false],
  ],
  "10": [
    ["ecdf6a1b-9d39-4e16-a5b9-f7f642ec2719", false],
    ["47007274-941c-4cc8-8206-231ff0205a7c", true],
    ["1824bb82-d3d8-4290-8888-7581449a6bb1", false],
    ["99b2fc8f-d3c6-43d8-a6de-456d92076135", false],
  ],
  "11": [
    ["30a75119-b033-4012-9f6a-7a66d789c8ed", false],
    ["1797409f-436a-45c4-a60b-6694f6b17a5a", false],
    ["fe4abffc-664e-4f54-969c-d8477c0d9e58", true],
    ["14fe0042-51bf-4b8e-a80a-8bfd10e56ecd", false],
  ],
  "13": [
    ["53cbc79f-ff4e-468f-b92c-5fa4c95a243f", false],
    ["36dcc5b4-3d3c-4b8a-b610-3fd8faa1c757", true],
    ["d295b5a4-01bd-4cee-bae8-32f6aaebf171", false],
    ["3592342c-6e1f-4753-87e5-86f1287f843a", false],
  ],
  "14": [
    ["85757a0d-9b2e-4ac2-903a-68b93f2ba43f", false],
    ["63d217f5-f99e-4619-bb63-88b9791b715e", true],
    ["991cfc4d-9b5f-4901-b79b-7f53a416aa5a", false],
    ["b0161b50-7d92-405a-84ae-5fdd102146ed", false],
  ],
  "20": [
    ["972cda8c-aab2-48a4-a13d-8d396c7e9561", false],
    ["5311ae95-9d18-410e-baa7-74ba29f5e44c", false],
    ["48d48810-77c7-4071-b315-b49a3e966295", true],
    ["c6c0de44-8d1b-42c0-9cb3-08780b281a9d", false],
  ],
  "21": [
    ["c9d63126-c4ba-4c8d-895c-b9337c16f86d", false],
    ["18e7cf21-6eae-478c-8366-eaee3c3dfc7b", true],
    ["26735295-c221-431d-ac16-783303e26d67", false],
    ["b3a70b1b-ff95-482f-b485-dbbb954d84c5", false],
  ],
  "22": [
    ["d3b31f18-58ec-4c15-af07-25482b261da5", false],
    ["538c28d1-2cb8-48ff-985e-14a93f420284", true],
    ["c629525c-3ef4-4692-a321-b6d2917e6afc", false],
    ["8e256e24-a53f-42b3-9443-a41d8413319a", false],
  ],
  "24": [
    ["44c2c42f-9dd0-45cb-86ba-1d37507a428a", true],
    ["e0f69cdf-6e63-47cd-916e-9d028f24aed7", false],
    ["7b57447a-c966-4ac5-8542-10623dd9e17d", false],
    ["2e189fbf-898a-4e11-a366-c28dbd41fc82", false],
  ],
  "25": [
    ["5666664f-445f-42aa-bd7b-59e94cf4c07a", false],
    ["c9c057bd-831b-4b5c-8613-61a55be03b0f", true],
    ["dbf9027c-5adc-46fc-b65a-392457faba89", false],
    ["bd351ff5-4bc4-480f-8dcf-6b3b49365e7d", false],
  ],
  "26": [
    ["0638a306-df7c-4a18-bf63-ee693f10049a", false],
    ["37594c72-9c2e-4852-8bd0-1d30d5d57b66", true],
    ["281fe12f-105b-49d1-a561-94b11b4dd9bf", false],
    ["fdfacf57-6a32-4553-b1b7-792dd9f6aeed", false],
  ],
  "29": [
    ["4c2ee57c-04f0-45df-a12d-3381097f58e2", false],
    ["b408173f-2623-484b-8f07-f68769945b76", true],
    ["7be6b1e9-893e-4ed0-ae4a-724201ed2730", false],
    ["95957557-b049-427c-aba9-767f81ba95d7", false],
  ],
};

/** option id → content_doc, transcribed from `question_options.content_doc`. */
const OPTION_DOCS = {
  // Q1
  "98e8945b-6e89-4ec7-9dae-d876a2a90a3b": { math: "u_n = 5n - 2" },
  "9e169931-aa7f-407f-825d-90432f497904": { math: "u_1 = 6,\\quad u_{n+1} = 2u_n + 1" },
  "64122afc-8df0-45d6-834d-287715938bbb": { math: "u_{n+1} = 2u_n + 1,\\ u_1 = 6" },
  "80f0a745-1c51-4a5c-9c52-659ebab1eb48": { math: "u_{n+1} = 2u_n + 1" },
  // Q2
  "323bd4a6-7fe0-46a6-b970-9d93a6cd437d": { text: "67" },
  "fb9cf1e3-ffb1-4040-9ed4-34d34ee80d2b": { text: "85" },
  "90202145-c985-43ba-bcc9-c4f0a491ade9": { text: "95" },
  "cebbac34-6d12-4265-9ce1-8a6fc1b62885": { text: "157" },
  // Q3
  "752d3bcb-49c5-4980-8190-df4914deaa0c": { math: "d = -7,\\ u_{10} = -21" },
  "b2bd0bd4-7b00-4168-88a3-e3f93123eee9": { math: "d = -7,\\ u_{10} = -28" },
  "164122cb-a03e-4a9e-a64a-4f2090baab18": { math: "d = 7,\\ u_{10} = 105" },
  "30cff300-1d64-4c42-9bc0-47468e91cefb": { math: "d = -7,\\ u_{10} = -14" },
  // Q4
  "c2867ff6-6d73-4a0c-8490-56e9009f8497": { math: "u_n = 3n + 4" },
  "0f97f4cb-b7fb-4e13-80d2-a7d4fbcc7e1b": { math: "u_n = 4n + 3" },
  "b435f108-4a26-4884-a6e7-25aa67fe9603": { math: "u_n = 4n - 1" },
  "1b9db58f-79f9-4a87-b699-0dc2dd56c9c8": { math: "u_n = 3n + 1" },
  // Q5
  "0e2d2d1d-4f9c-4962-9d4d-214b8db60474": { math: "r = -\\frac{1}{2},\\ u_6 = 4" },
  "82bc8b59-360e-49b8-bdd9-1e6c14905b52": { math: "r = -\\frac{1}{2},\\ u_6 = -4" },
  "7b469b12-a549-4f55-b313-c79015cf8127": { math: "r = \\frac{1}{2},\\ u_6 = 4" },
  "1a93076b-2e4c-4c8f-9268-347c05441088": { math: "r = -2,\\ u_6 = -8" },
  // Q6
  "5d32638c-ff5e-43dc-afe2-a52137b4ed6f": { text: "Arithmetic" },
  "29e1dfaf-91fb-4dff-926f-964c63c29aa0": { text: "Geometric" },
  "3bfb9367-114e-4781-8f92-1f8c61a65bc8": { text: "Quadratic" },
  "699c622e-fb9e-4087-b35d-8ac6c443da11": { text: "Constant" },
  // Q7
  "e58b1b26-5f17-43bc-b4d6-a62eaa117cb2": { math: "\\frac{n}{2n-1}" },
  "b8cbbb22-ce2c-4161-922c-da9529636965": { math: "\\frac{n}{2n+1}" },
  "20050fd8-fa84-47bd-bedf-d709e89bda99": { math: "\\frac{1}{2n+1}" },
  "c5a3f513-368a-485a-8d72-683b9b51f3ef": { math: "\\frac{n+1}{2n+3}" },
  // Q8
  "943283e0-5829-421d-afd7-4ccf57bb5f4e": { text: "176" },
  "50d11682-b1ac-40b2-9477-27250f763b47": { text: "180" },
  "d57246c7-9a8b-4d45-8903-277955ae1174": { text: "198" },
  "e3edc570-4168-4375-8ce1-d1b455a91b40": { text: "396" },
  // Q9
  "f45a6c46-0396-44f3-b08d-e7b71891df38": { math: "a = 3,\\ k = 68" },
  "fdc708fa-fa83-474e-a972-8f15fabfa961": { math: "a = 6,\\ k = 68" },
  "bd56ef54-9760-47b6-977f-66b5b417dd73": { math: "a = 3,\\ k = 62" },
  "159bbee1-0ce1-4b4c-af4b-acbe24ca811d": { math: "a = 6,\\ k = 62" },
  // Q10
  "ecdf6a1b-9d39-4e16-a5b9-f7f642ec2719": { math: "64\\left(\\frac34\\right)^n;\\ u_5 = \\frac{81}{4}" },
  "47007274-941c-4cc8-8206-231ff0205a7c": { math: "64\\left(\\frac34\\right)^{n-1};\\ u_5 = \\frac{81}{4}" },
  "1824bb82-d3d8-4290-8888-7581449a6bb1": { math: "64 - 16(n-1);\\ u_5 = 0" },
  "99b2fc8f-d3c6-43d8-a6de-456d92076135": { math: "64\\left(\\frac43\\right)^{n-1};\\ u_5 = \\frac{81}{4}" },
  // Q11
  "30a75119-b033-4012-9f6a-7a66d789c8ed": { text: "19" },
  "1797409f-436a-45c4-a60b-6694f6b17a5a": { text: "29" },
  "fe4abffc-664e-4f54-969c-d8477c0d9e58": { text: "35" },
  "14fe0042-51bf-4b8e-a80a-8bfd10e56ecd": { text: "67" },
  // Q13
  "53cbc79f-ff4e-468f-b92c-5fa4c95a243f": { text: "495" },
  "36dcc5b4-3d3c-4b8a-b610-3fd8faa1c757": { text: "555" },
  "d295b5a4-01bd-4cee-bae8-32f6aaebf171": { text: "585" },
  "3592342c-6e1f-4753-87e5-86f1287f843a": { text: "1 110" },
  // Q14
  "85757a0d-9b2e-4ac2-903a-68b93f2ba43f": { text: "$10 240" },
  "63d217f5-f99e-4619-bb63-88b9791b715e": { text: "$12 800" },
  "991cfc4d-9b5f-4901-b79b-7f53a416aa5a": { text: "$16 000" },
  "b0161b50-7d92-405a-84ae-5fdd102146ed": { text: "$10 000" },
  // Q20
  "972cda8c-aab2-48a4-a13d-8d396c7e9561": { text: "421" },
  "5311ae95-9d18-410e-baa7-74ba29f5e44c": { text: "633" },
  "48d48810-77c7-4071-b315-b49a3e966295": { text: "665" },
  "c6c0de44-8d1b-42c0-9cb3-08780b281a9d": { text: "729" },
  // Q21
  "c9d63126-c4ba-4c8d-895c-b9337c16f86d": { math: "k = 4,\\ r = 2" },
  "18e7cf21-6eae-478c-8366-eaee3c3dfc7b": { math: "k = 8,\\ r = 2" },
  "26735295-c221-431d-ac16-783303e26d67": { math: "k = 8,\\ r = 3" },
  "b3a70b1b-ff95-482f-b485-dbbb954d84c5": { math: "k = 6,\\ r = 5" },
  // Q22
  "d3b31f18-58ec-4c15-af07-25482b261da5": { text: "5" },
  "538c28d1-2cb8-48ff-985e-14a93f420284": { text: "6" },
  "c629525c-3ef4-4692-a321-b6d2917e6afc": { text: "7" },
  "8e256e24-a53f-42b3-9443-a41d8413319a": { text: "8" },
  // Q24
  "44c2c42f-9dd0-45cb-86ba-1d37507a428a": { text: "Quadratic (a = 2); u4 = 30" },
  "e0f69cdf-6e63-47cd-916e-9d028f24aed7": { text: "Quadratic (a = 4); u4 = 30" },
  "7b57447a-c966-4ac5-8542-10623dd9e17d": { text: "Quadratic (a = 2); u4 = 47" },
  "2e189fbf-898a-4e11-a366-c28dbd41fc82": { text: "Arithmetic (d = 4); u4 = 15" },
  // Q25
  "5666664f-445f-42aa-bd7b-59e94cf4c07a": { math: "3^{n-1} + 3" },
  "c9c057bd-831b-4b5c-8613-61a55be03b0f": { math: "3^n + 1" },
  "dbf9027c-5adc-46fc-b65a-392457faba89": { math: "4(3)^{n-1} - 2" },
  "bd351ff5-4bc4-480f-8dcf-6b3b49365e7d": { math: "2(3)^n - 2" },
  // Q26
  "0638a306-df7c-4a18-bf63-ee693f10049a": { math: "u_1 = 7,\\ u_{n+1} = u_n - 4" },
  "37594c72-9c2e-4852-8bd0-1d30d5d57b66": { math: "u_1 = 3,\\ u_{n+1} = u_n + 7" },
  "281fe12f-105b-49d1-a561-94b11b4dd9bf": { math: "u_1 = 3,\\ u_{n+1} = 7u_n - 4" },
  "fdfacf57-6a32-4553-b1b7-792dd9f6aeed": { math: "u_1 = -4,\\ u_{n+1} = u_n + 7" },
  // Q29
  "4c2ee57c-04f0-45df-a12d-3381097f58e2": { text: "563 709 FCFA" },
  "b408173f-2623-484b-8f07-f68769945b76": { text: "597 532 FCFA" },
  "7be6b1e9-893e-4ed0-ae4a-724201ed2730": { text: "530 000 FCFA" },
  "95957557-b049-427c-aba9-767f81ba95d7": { text: "633 384 FCFA" },
};

const ANSWERS = {
  "001001": { answer: { option_id: "64122afc-8df0-45d6-834d-287715938bbb" }, points_awarded: 1 },
  "001031": {
    answer: {
      parts: {
        a1: "An=-4n+32",
        a2: "Gn= 3(7)^n-1",
        a3: "A4=G4=16",
        a4: "The common ratio for the graph is -4",
        b1: "The first Negative term is 8",
        b2: "760",
        b3: "n=-10 in the formule it gives 42",
      },
    },
    points_awarded: 0,
    marker_note:
      "MYP5 C B Q1: All attempted parts mathematically incorrect (auto keyword false positives on a3/a4/b3 removed). Adjusted 2 -> 0/10.",
  },
  "001002": { answer: { option_id: "fb9cf1e3-ffb1-4040-9ed4-34d34ee80d2b" }, points_awarded: 1 },
  "001032": {
    answer: { parts: { a1: "2", a2: "Cn=2 and Tn=3", a4: "Tn is arithemetic", b3: "Stage 4", c2: "Stage 11" } },
    points_awarded: 0,
  },
  "001003": { answer: { option_id: "752d3bcb-49c5-4980-8190-df4914deaa0c" }, points_awarded: 1 },
  "001033": {
    answer: { parts: { a1: "Geometric", a2: "Arithemetic", c3: "she put the wrong n and used the geometric series." } },
    points_awarded: 0,
  },
  "001004": { answer: { option_id: "b435f108-4a26-4884-a6e7-25aa67fe9603" }, points_awarded: 1 },
  "001034": { answer: { parts: { r: "0.6", e6: "46.6" } }, points_awarded: 0 },
  "001005": { answer: { option_id: "82bc8b59-360e-49b8-bdd9-1e6c14905b52" }, points_awarded: 1 },
  "001006": { answer: { option_id: "3bfb9367-114e-4781-8f92-1f8c61a65bc8" }, points_awarded: 1 },
  "001007": { answer: { option_id: "b8cbbb22-ce2c-4161-922c-da9529636965" }, points_awarded: 1 },
  "001008": { answer: { option_id: "d57246c7-9a8b-4d45-8903-277955ae1174" }, points_awarded: 1 },
  "001009": { answer: { option_id: "f45a6c46-0396-44f3-b08d-e7b71891df38" }, points_awarded: 2 },
  "001010": { answer: { option_id: "47007274-941c-4cc8-8206-231ff0205a7c" }, points_awarded: 2 },
  "001011": { answer: { option_id: "30a75119-b033-4012-9f6a-7a66d789c8ed" }, points_awarded: 0 },
  "001012": { answer: { parts: { d: "6", u25: "149" } }, points_awarded: 2 },
  "001013": { answer: { option_id: "36dcc5b4-3d3c-4b8a-b610-3fd8faa1c757" }, points_awarded: 2 },
  "001014": { answer: { option_id: "63d217f5-f99e-4619-bb63-88b9791b715e" }, points_awarded: 2 },
  "001015": { answer: { parts: { rule: "Tn=n+3" } }, points_awarded: 2 },
  "001016": { answer: { parts: { i1: "(1,6)", i2: "(3,12)", diff: "8" } }, points_awarded: 3 },
  "001017": { answer: { parts: { r: "3", s5: "52", u1: "4" } }, points_awarded: 2 },
  "001018": { answer: { parts: { d: "4", s8: "256", u4: "96" } }, points_awarded: 2 },
  "001019": { answer: { parts: { solve: "The positive integer is 9", terms: "U1=4 and U5= 24" } }, points_awarded: 1 },
  "001020": { answer: { option_id: "972cda8c-aab2-48a4-a13d-8d396c7e9561" }, points_awarded: 0 },
  "001021": { answer: { option_id: "18e7cf21-6eae-478c-8366-eaee3c3dfc7b" }, points_awarded: 2 },
  "001022": { answer: { option_id: "538c28d1-2cb8-48ff-985e-14a93f420284" }, points_awarded: 2 },
  "001023": { answer: { parts: { r1: "Arithmetic U5= 72", r2: "Geometric", r3: "Quadratic" } }, points_awarded: 0 },
  "001024": { answer: { option_id: "2e189fbf-898a-4e11-a366-c28dbd41fc82" }, points_awarded: 0 },
  "001025": { answer: { option_id: "c9c057bd-831b-4b5c-8613-61a55be03b0f" }, points_awarded: 2 },
  "001026": { answer: { option_id: "37594c72-9c2e-4852-8bd0-1d30d5d57b66" }, points_awarded: 2 },
  "001027": { answer: { parts: { u1: "12" } }, points_awarded: 1 },
  "001028": { answer: { parts: { n: "105", u10: "128" } }, points_awarded: 1 },
  "001029": { answer: { option_id: "b408173f-2623-484b-8f07-f68769945b76" }, points_awarded: 2 },
  "001030": { answer: { parts: { r: "0.9", s6: "18742", v6: "262.4" } }, points_awarded: 1 },
};

/** Serialise a value as readable JS source. */
function toSource(value, indent = 2) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => `${pad}  ${toSource(v, indent + 2)}`).join(",\n")},\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{\n${entries
      .map(([k, v]) => {
        const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        return `${pad}  ${key}: ${toSource(v, indent + 2)}`;
      })
      .join(",\n")},\n${pad}}`;
  }
  return JSON.stringify(value);
}

const toDoc = (spec) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [spec.math ? { type: "mathInline", attrs: { latex: spec.math } } : { type: "text", text: spec.text }],
    },
  ],
});

const qid = (suffix) => `ce000000-0000-4000-8000-00000000${suffix}`;

const rows = QUESTIONS.map(([number, suffix, type, points, criterion, promptB64]) => {
  const base = { id: qid(suffix), type, points, criterion: criterion, number: Number(number), prompt: b64(promptB64) };
  if (OPTIONS[number]) {
    return {
      ...base,
      options: OPTIONS[number].map(([id, correct], position) => ({
        id,
        label: String.fromCharCode(65 + position),
        is_correct: correct,
        content_doc: toDoc(OPTION_DOCS[id]),
      })),
    };
  }
  if (PARTS[number]) {
    return {
      ...base,
      parts: PARTS[number].map(([id, label, kind, pts, unit, answer, prompt]) => ({
        id,
        label,
        kind,
        points: pts,
        prompt,
        hints: [`Re-read what ${label} is asking you to find.`, `Use the data and method named in the question for ${label}.`],
        ...(unit && unit !== "-" ? { unit } : {}),
        ...(answer !== null ? { answer } : {}),
        ...(kind === "numeric" && answer !== null ? { tolerance: 0 } : {}),
        ...(kind !== "numeric" && ACCEPTED[number]?.[id] ? { accepted: ACCEPTED[number][id] } : {}),
      })),
    };
  }
  return base;
});

const answers = Object.fromEntries(Object.entries(ANSWERS).map(([k, v]) => [qid(k), v]));

const fixture = `/**
 * REAL MYP5 Version C submission, captured from production.
 *
 * Candidate: Oxane ZOCLI \u00b7 attempt d3bbe8de-4d90-4d48-a7d0-84802c4494c7
 * Stored score 56/100 (raw 41 plus the school's internal score adjustment, which
 * is never shown to students). Answer payloads, awarded marks, marker notes,
 * question prompts, part specs and option documents are transcribed verbatim
 * from Supabase so the PDF verifier renders a genuine paper, not a synthetic one.
 *
 * Generated by \`scripts/real-paper-data/_gen-myp5.mjs\`; edit that script and
 * re-run it rather than hand-patching this file.
 */

export const MYP5_OXANE = {
  label: "MYP5 Version C \u2014 Oxane ZOCLI (real production submission)",
  exam: "ce000000-0000-4000-8000-000000000002",
  attempt: "d3bbe8de-4d90-4d48-a7d0-84802c4494c7",
  student: "Oxane ZOCLI",
  score: 56,
  maxScore: 100,
  criteria: ${toSource(
    [
      { code: "A", title: "Knowing and understanding", marksAwarded: 15, marksMax: 32 },
      { code: "B", title: "Investigating patterns", marksAwarded: 8, marksMax: 24 },
      { code: "C", title: "Communicating", marksAwarded: 9, marksMax: 20 },
      { code: "D", title: "Applying mathematics in real-life contexts", marksAwarded: 9, marksMax: 24 },
    ],
    2,
  )},
  rows: ${toSource(rows, 2)},
  answers: ${toSource(answers, 2)},
};
`;

writeFileSync(new URL("./myp5-oxane.mjs", import.meta.url), fixture);
console.log(`wrote myp5-oxane.mjs \u00b7 ${rows.length} rows \u00b7 ${Object.keys(answers).length} answers`);
