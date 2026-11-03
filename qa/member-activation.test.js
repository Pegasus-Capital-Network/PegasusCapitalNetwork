"use strict";

const assert = require("node:assert/strict");
const fn = require("../netlify/functions/member-activation.js");

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "arden@example.com",
  full_name: "Arden Gist",
  profile_slug: "arden-gist"
};

for (const step of ["profile_live", "invite_circle", "share_profile"]) {
  const row = { ...base, step };
  const m = fn._message(row);
  const rendered = fn._render(row);
  assert.ok(m.subject.length > 10, step + " subject");
  assert.ok(rendered.html.includes("Pegasus Capital Network"), step + " brand");
  assert.ok(rendered.text.includes("Arden"), step + " first name");
  assert.ok(rendered.html.includes("unsubscribe?e=arden%40example.com"), step + " unsubscribe");
}

assert.match(fn._message({ ...base, step:"profile_live" }).href, /\/u\/arden-gist/);
assert.match(fn._message({ ...base, step:"invite_circle" }).href, /dashboard\.html\?invite=1/);
assert.match(fn._message({ ...base, step:"share_profile" }).href, /share-studio\.html/);

console.log("member activation templates: ok");

