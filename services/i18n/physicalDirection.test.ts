/**
 * The class matcher behind the fiscalis/no-physical-direction lint rule
 * (frontend/eslint-rules/no-physical-direction.mjs, ENG-188): physical
 * left/right Tailwind classes in page code are reported with their logical
 * replacement so the layout mirrors in Arabic.
 */
import { describe, expect, it } from "vitest";

import { findPhysicalClasses } from "../../frontend/eslint-rules/no-physical-direction.mjs";

type Finding = { token: string; fix: string };
const fixes = (text: string) =>
  (findPhysicalClasses(text) as Finding[]).map((f) => [f.token, f.fix]);

describe("findPhysicalClasses", () => {
  it("maps margins, paddings and insets to their logical names", () => {
    expect(fixes("ml-2 mr-auto pl-9 pr-4 left-3 right-0 -mr-3")).toEqual([
      ["ml-2", "ms-2"],
      ["mr-auto", "me-auto"],
      ["pl-9", "ps-9"],
      ["pr-4", "pe-4"],
      ["left-3", "start-3"],
      ["right-0", "end-0"],
      ["-mr-3", "-me-3"],
    ]);
  });

  it("maps text alignment, floats, borders and corners", () => {
    expect(
      fixes(
        "text-right text-left float-right border-l border-l-4 border-r-metal-gold rounded-l rounded-tr-md",
      ),
    ).toEqual([
      ["text-right", "text-end"],
      ["text-left", "text-start"],
      ["float-right", "float-end"],
      ["border-l", "border-s"],
      ["border-l-4", "border-s-4"],
      ["border-r-metal-gold", "border-e-metal-gold"],
      ["rounded-l", "rounded-s"],
      ["rounded-tr-md", "rounded-se-md"],
    ]);
  });

  it("keeps variants on the fix", () => {
    expect(fixes("md:pl-6 [&>svg]:mr-2 hover:!border-l-[6px] first:rounded-l")).toEqual([
      ["md:pl-6", "md:ps-6"],
      ["[&>svg]:mr-2", "[&>svg]:me-2"],
      ["hover:!border-l-[6px]", "hover:!border-s-[6px]"],
      ["first:rounded-l", "first:rounded-s"],
    ]);
  });

  it("accepts logical classes and unrelated words", () => {
    expect(
      fixes(
        "ms-2 me-1 ps-9 pe-4 start-3 end-0 text-start text-end border-s-4 rounded-se rounded-lg border-red-500 border-ring place-items-center prose top-right left right",
      ),
    ).toEqual([]);
  });

  it("allows symmetric centring", () => {
    expect(fixes("absolute left-1/2 -translate-x-1/2")).toEqual([]);
    expect(fixes("fixed left-[50%] translate-x-[-50%]")).toEqual([]);
  });

  it("wants an rtl: counterpart for space-x and translate-x", () => {
    expect(fixes("flex space-x-2")).toHaveLength(1);
    expect(fixes("flex space-x-2 rtl:space-x-reverse")).toEqual([]);
    expect(fixes("translate-x-1/3")).toHaveLength(1);
    expect(fixes("translate-x-1/3 rtl:-translate-x-1/3")).toEqual([]);
    expect(fixes("data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5")).toEqual([]);
  });
});
