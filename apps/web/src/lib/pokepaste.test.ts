import { describe, it, expect } from "vitest";
import { extractPokepasteId } from "./pokepaste";

describe("extractPokepasteId", () => {
  it("extracts ID from full pokepast.es URL with /raw", () => {
    expect(extractPokepasteId("https://pokepast.es/9aaecbacdacce/raw")).toBe("9aaecbacdacce");
  });

  it("extracts ID from full pokepast.es URL without /raw", () => {
    expect(extractPokepasteId("https://pokepast.es/9aaecbacdacce")).toBe("9aaecbacdacce");
  });

  it("extracts ID from full pokepast.es URL with trailing slash", () => {
    expect(extractPokepasteId("https://pokepast.es/9aaecbacdacce/")).toBe("9aaecbacdacce");
  });

  it("extracts ID from http scheme", () => {
    expect(extractPokepasteId("http://pokepast.es/9aaecbacdacce")).toBe("9aaecbacdacce");
  });

  it("extracts ID from www subdomain", () => {
    expect(extractPokepasteId("https://www.pokepast.es/9aaecbacdacce")).toBe("9aaecbacdacce");
  });

  it("extracts ID with query parameters", () => {
    expect(extractPokepasteId("https://pokepast.es/9aaecbacdacce?foo=bar")).toBe("9aaecbacdacce");
  });

  it("extracts ID from URL without scheme", () => {
    expect(extractPokepasteId("pokepast.es/9aaecbacdacce")).toBe("9aaecbacdacce");
  });

  it("extracts ID from raw ID string", () => {
    expect(extractPokepasteId("9aaecbacdacce")).toBe("9aaecbacdacce");
  });

  it("trims whitespace", () => {
    expect(extractPokepasteId("  https://pokepast.es/9aaecbacdacce/raw \n")).toBe("9aaecbacdacce");
    expect(extractPokepasteId("  9aaecbacdacce  ")).toBe("9aaecbacdacce");
  });

  it("returns null for non-pokepast.es domains", () => {
    expect(extractPokepasteId("https://malicious.com/9aaecbacdacce")).toBeNull();
  });

  it("returns null for invalid characters", () => {
    expect(extractPokepasteId("https://pokepast.es/<script>")).toBeNull();
    expect(extractPokepasteId("id with spaces")).toBeNull();
  });

  it("returns null for empty or whitespace-only inputs", () => {
    expect(extractPokepasteId("")).toBeNull();
    expect(extractPokepasteId("   ")).toBeNull();
  });
});
