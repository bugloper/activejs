// Compile-only checks for the global augmentations from "@bugloper/activejs/core_ext".
import "@bugloper/activejs/core_ext";
import type { Duration, TimeWithZone } from "@bugloper/activejs";

const people: string = "person".pluralize();
const camel: string = "active_model".camelize("lower");
const blank: boolean = "  ".isBlank();
const presence: string | undefined = "x".presence();
const short: string = "Hello World".truncate(5, { omission: "…" });
const dur: Duration = (2).days();
const later: Date = (2).days().fromNow();
const bytes: number = (5).megabytes();
const nth: string = (3).ordinalize();
const money: string = (1234.5).numberToCurrency();
const sentence: string = [1, 2, 3].toSentence();
const ids: number[] = [{ id: 1 }].pluck("id");
const total: number = [1, 2].sum();
const ages: number = [{ age: 1 }].sum((p) => p.age);
const groups: Array<Array<number | null>> = [1, 2, 3].inGroupsOf(2);
const second: number | undefined = [1, 2].second();
const start: Date = new Date().beginningOfMonth();
const db: string = new Date().toFs("db");
const zoned: TimeWithZone = new Date().inTimeZone("Tokyo");
const diff: number = new Date().minus(new Date());
const shifted: Date = new Date().plus((1).hour());
// @ts-expect-error pluck key must exist on the element type
[{ id: 1 }].pluck("nope");

void [people, camel, blank, presence, short, dur, later, bytes, nth, money, sentence, ids, total, ages, groups,
  second, start, db, zoned, diff, shifted];
