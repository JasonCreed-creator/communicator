/** @vitest-environment jsdom */
// 직인 자산 — 견적서 공급자 행 "(인)" 위 직인 (2026-09-24 사용자 제공 직인, 누끼 후 public/brand 반영).
//
// 계약:
// ① 커밋된 remember-seal.png는 정사각 투명 PNG(300px+)다 — JPG·흰 배경이면 "(인)" 글자와 행 선을 가린다
// ② 그 파일이 국문 견적서 공급자 행 H7 "(인)" 중심에 72px로 얹힌다(사용자 선택 72px — 60/72/84 실렌더 비교).
//    영문 견적서에는 직인도 "(Seal)" 표식도 없다 — 공급자 행은 다른 행처럼 G:H 병합(2026-09-24 사용자 결정: 영문 주소가 길어
//    직인이 끝 글자를 덮었다 → 직인 삭제 → 표식도 삭제)
// ③ 없는 자산 경로에 호스트가 index.html을 200으로 돌려줘도(Vercel SPA rewrite) 이미지로 넣지 않는다
//    — 2026-09-24 실측: 운영 사이트에서 직인 파일이 없을 때 모든 견적서에 HTML 917B가 PNG로 박혀 나갔다
// ④ 리멤버가 아닌 브랜드 견적서에는 리멤버 직인을 쓰지 않는다(자기 sealBase64가 있을 때만 직인)
//
// exportEstimate는 자산을 모듈 수준에서 캐시한다 — 테스트마다 모듈을 새로 읽어 fetch 스텁이 실제로 불리게 한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const SEAL_PATH = resolve(process.cwd(), "public/brand/remember-seal.png");
const SEAL_URL = "/brand/remember-seal.png";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;
const CFG: Cfg = {
  projectTitle: "샘플 테크 컨퍼런스 2026",
  target: 300,
  guarantee: 80,
  venueType: "5star",
  venueRegion: "서울 강남",
  venueName: "가상컨벤션센터 3F 그랜드볼룸",
  venueRental: 36_000_000,
  displayType: "led",
  options: { souvenir: true, emcee: true, video: true },
  boothCount: 3,
};

type AssetTable = Record<string, { status: number; body: Uint8Array }>;

/** 자산 경로 → 응답. 표에 없는 경로는 네트워크 실패로 떨어진다 */
function stubAssets(table: AssetTable) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: unknown) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push(url);
    const hit = table[url];
    if (!hit) throw new Error(`network disabled in test: ${url}`);
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      arrayBuffer: async () => hit.body.buffer.slice(hit.body.byteOffset, hit.body.byteOffset + hit.body.byteLength),
    } as unknown as Response;
  });
  return calls;
}

async function exportFresh(cfg: Cfg, opts: Record<string, unknown> = {}) {
  vi.resetModules();
  const { exportEstimate } = await import("../export/exportEstimate");
  const { calcEstimate } = await import("../engine/calcEstimate");
  const { blob } = await exportEstimate(cfg, calcEstimate(cfg), { download: false, ...opts });
  const buf = await new Promise<ArrayBuffer>((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(fr.result as ArrayBuffer);
    fr.readAsArrayBuffer(blob);
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { wb, ws: wb.worksheets[0] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("직인 자산 계약 — public/brand/remember-seal.png", () => {
  const bytes = readFileSync(SEAL_PATH);

  it("PNG 서명 · 정사각 · 300px 이상 · 알파 채널(투명 배경)", () => {
    expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    // IHDR: 길이(4) 'IHDR'(4) 다음에 width(4)·height(4)·bitDepth(1)·colorType(1)
    expect(bytes.toString("latin1", 12, 16)).toBe("IHDR");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const colorType = bytes[25];
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(300);
    // 6 = RGBA. 팔레트(3)면 tRNS 청크가 있어야 투명이다 — 흰 배경 RGB(2)·JPG는 거부
    const hasTrns = bytes.includes(Buffer.from("tRNS", "latin1"));
    expect(colorType === 6 || (colorType === 3 && hasTrns)).toBe(true);
  });
});

describe("견적서 직인 삽입 — 리멤버 기본 레이아웃", () => {
  it("공개 경로 직인이 공급자 행 H7 '(인)' 중심에 72px로 얹힌다 — 커밋된 파일 그대로", async () => {
    const seal = new Uint8Array(readFileSync(SEAL_PATH));
    const calls = stubAssets({ [SEAL_URL]: { status: 200, body: seal } });
    const { wb, ws } = await exportFresh(CFG);

    expect(calls).toContain(SEAL_URL);
    const images = ws.getImages();
    expect(images).toHaveLength(1); // 로고 경로는 스텁에 없어 빠진다 — 남은 1건이 직인
    const range = images[0].range as unknown as {
      tl: { nativeCol: number; nativeRow: number };
      ext?: { width: number; height: number };
    };
    expect(range.tl.nativeCol).toBe(7); // H열
    expect(range.tl.nativeRow).toBe(5); // 7행 중심에 오도록 한 행 위에서 시작
    expect(range.ext).toMatchObject({ width: 72, height: 72 });
    expect(ws.getCell("H7").value).toBe("(인)"); // 표식은 그대로 — 직인이 그 위에 얹힌다

    const media = wb.getImage(Number(images[0].imageId)) as unknown as { extension: string; buffer: Uint8Array };
    expect(media.extension).toBe("png");
    expect(media.buffer.byteLength).toBe(seal.byteLength);
  });

  it("영문 견적서에는 직인도 '(Seal)' 표식도 없다 — 공급자 행은 G:H 병합, 직인 파일을 받지도 않는다", async () => {
    const calls = stubAssets({ [SEAL_URL]: { status: 200, body: new Uint8Array(readFileSync(SEAL_PATH)) } });
    const { ws } = await exportFresh(CFG, { lang: "en" });
    expect(String(ws.getCell("G7").value)).toBe("Remember & Company");
    expect(ws.getCell("G7").isMerged).toBe(true);
    expect(ws.getCell("H7").value).not.toBe("(Seal)");
    expect(ws.getImages()).toHaveLength(0);
    expect(calls).not.toContain(SEAL_URL);
  });

  it("없는 자산에 호스트가 index.html(200)을 돌려줘도 이미지로 넣지 않는다 — SPA 폴백", async () => {
    const html = new TextEncoder().encode('<!doctype html>\n<html lang="ko"><head><title>MICE 커뮤니케이터</title></head></html>');
    stubAssets({
      [SEAL_URL]: { status: 200, body: html },
      "/brand/remember-logo-offwhite.png": { status: 200, body: html },
    });
    const { wb, ws } = await exportFresh(CFG);
    expect(ws.getImages()).toHaveLength(0);
    // 워크북 어디에도 HTML 바이트가 미디어로 들어가지 않는다
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((wb as any).model?.media ?? []).length).toBe(0);
    expect(ws.getCell("H7").value).toBe("(인)"); // 글자 표식만 남는다
  });

  it("리멤버가 아닌 브랜드는 자기 sealBase64가 없으면 리멤버 직인을 쓰지 않는다", async () => {
    const calls = stubAssets({ [SEAL_URL]: { status: 200, body: new Uint8Array(readFileSync(SEAL_PATH)) } });
    const { ws } = await exportFresh(CFG, {
      brand: {
        titleKo: "가상파트너스 견적서",
        sheetName: "가상파트너스",
        supplierKo: "㈜가상파트너스",
        addressKo: "서울 가상구 가상로 1",
        filePrefix: "가상파트너스견적서",
        defaultProjectKo: "가상 행사",
      },
    });
    expect(String(ws.getCell("G7").value)).toBe("㈜가상파트너스");
    expect(ws.getImages()).toHaveLength(0);
    expect(calls).not.toContain(SEAL_URL); // 받지도 않는다
  });
});
