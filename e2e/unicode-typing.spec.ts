import { expect, test, Page } from "@playwright/test";
import { ConvexTestingHelper } from "convex-helpers/testing";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import {
  TEST_PARAGRAPH_UNICODE,
  TEST_PARAGRAPH_ELLIPSIS,
  TEST_PARAGRAPH_ENDASH,
  TEST_PARAGRAPH_MINUS,
  TEST_PARAGRAPH_MULTIPLY,
  TEST_PARAGRAPH_LOGICAL_NOT,
  TEST_PARAGRAPH_DOUBLE_ARROW,
  TEST_PARAGRAPH_UMLAUT,
  TEST_PARAGRAPH_MAPS_TO,
} from "../convex/testingFunctions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const UNICODE_MAPS = {
  standard: {
    "\u2019": "'",
    "\u2014": "---",
    "\u201C": '"',
    "\u201D": '"',
  },
  ellipsis: {
    "\u2019": "'",
    "\u2026": "...",
  },
  endash: {
    "\u2013": "--",
  },
  minus: {
    "\u2212": "-",
  },
  multiply: {
    "\u00d7": "*",
  },
  logicalNot: {
    "\u00ac": "~",
  },
  doubleArrow: {
    "\u21d2": "=>",
  },
  umlaut: {
    "\u00f6": '"o',
  },
  mapsTo: {
    "\u21a6": "|->",
  },
};

async function typeTextWithUnicode(page: Page, text: string, unicodeMap: Record<string, string>) {
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (const char of word) {
      const key = unicodeMap[char] || char;
      for (const singleChar of key) {
        await page.keyboard.type(singleChar);
        await page.waitForTimeout(5);
      }
    }
    if (i < words.length - 1) {
      await page.keyboard.press("Space");
    }
  }
}

async function signInAndCreateRoom(page: Page, convex: ConvexTestingHelper): Promise<{ userId: Id<"users">, roomCode: string }> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign In to Start Racing" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("claude+clerk_test@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "Enter verification code" }).pressSequentially("424242");
  await page.waitForSelector('button[aria-label="Open user button"]', { timeout: 10000 });

  const users = await convex.query(api.users.listUsers, {});
  const testUser = users.find((u) => u.name === "Claude Code");
  expect(testUser).toBeDefined();
  const userId = testUser!._id;

  await page.getByRole("button", { name: "Create Room" }).click();
  await page.waitForURL(/\/room\/.+/);
  const roomCode = page.url().match(/\/room\/([A-Z0-9]{6})/)![1];

  return { userId, roomCode };
}

test.describe("Unicode Paragraph Typing", () => {
  let convex: ConvexTestingHelper;
  let testRoomCode: string;
  let testUserId: Id<"users">;
  let testParagraphId: Id<"paragraphs">;

  test.beforeAll(async () => {
    convex = new ConvexTestingHelper({
      backendUrl: process.env.VITE_CONVEX_URL!,
    });

    testParagraphId = await convex.mutation(
      api.testingFunctions.ensureUnicodeParagraph,
      {},
    );
  });

  test.afterAll(async () => {
    if (testRoomCode) {
      const rooms = await convex.query(api.games.getRoom, {
        roomCode: testRoomCode,
      });
      if (rooms) {
        const room = rooms as any;
        await convex.mutation(api.testingFunctions.deleteTestRoom, {
          roomId: room._id,
        });
      }
    }

    if (testUserId) {
      await convex.mutation(api.testingFunctions.deleteTestUser, {
        userId: testUserId,
      });
    }

    if (testParagraphId) {
      await convex.mutation(api.testingFunctions.deleteTestParagraph, {
        paragraphId: testParagraphId,
      });
    }

    await convex.close();
  });

  test("smart quotes and em dash", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testUserId = userId;
    testRoomCode = roomCode;

    const paragraph = await convex.query(api.testingFunctions.getUnicodeParagraph, {});
    expect(paragraph!.content).toBe(TEST_PARAGRAPH_UNICODE);

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraph!._id,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_UNICODE, UNICODE_MAPS.standard);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_UNICODE.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });

  test("ellipsis character", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testRoomCode = roomCode;

    const paragraphId = await convex.mutation(api.testingFunctions.ensureTestParagraph, {
      content: TEST_PARAGRAPH_ELLIPSIS,
      title: "Test Ellipsis",
    });

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraphId,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_ELLIPSIS, UNICODE_MAPS.ellipsis);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_ELLIPSIS.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });

  test("en dash for ranges", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testRoomCode = roomCode;

    const paragraphId = await convex.mutation(api.testingFunctions.ensureTestParagraph, {
      content: TEST_PARAGRAPH_ENDASH,
      title: "Test En Dash",
    });

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraphId,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_ENDASH, UNICODE_MAPS.endash);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_ENDASH.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });

  test("minus sign in equations", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testRoomCode = roomCode;

    const paragraphId = await convex.mutation(api.testingFunctions.ensureTestParagraph, {
      content: TEST_PARAGRAPH_MINUS,
      title: "Test Minus Sign",
    });

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraphId,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_MINUS, UNICODE_MAPS.minus);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_MINUS.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });

  test("multiplication symbol", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testRoomCode = roomCode;

    const paragraphId = await convex.mutation(api.testingFunctions.ensureTestParagraph, {
      content: TEST_PARAGRAPH_MULTIPLY,
      title: "Test Multiplication",
    });

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraphId,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_MULTIPLY, UNICODE_MAPS.multiply);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_MULTIPLY.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });

  test("logical not symbol", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testRoomCode = roomCode;

    const paragraphId = await convex.mutation(api.testingFunctions.ensureTestParagraph, {
      content: TEST_PARAGRAPH_LOGICAL_NOT,
      title: "Test Logical Not",
    });

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraphId,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_LOGICAL_NOT, UNICODE_MAPS.logicalNot);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_LOGICAL_NOT.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });

  test("double arrow implication", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testRoomCode = roomCode;

    const paragraphId = await convex.mutation(api.testingFunctions.ensureTestParagraph, {
      content: TEST_PARAGRAPH_DOUBLE_ARROW,
      title: "Test Double Arrow",
    });

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraphId,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_DOUBLE_ARROW, UNICODE_MAPS.doubleArrow);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_DOUBLE_ARROW.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });

  test("o-umlaut in names", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testRoomCode = roomCode;

    const paragraphId = await convex.mutation(api.testingFunctions.ensureTestParagraph, {
      content: TEST_PARAGRAPH_UMLAUT,
      title: "Test O-Umlaut",
    });

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraphId,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_UMLAUT, UNICODE_MAPS.umlaut);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_UMLAUT.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });

  test("maps-to arrow in functions", async ({ page }) => {
    test.setTimeout(30000);
    const { userId, roomCode } = await signInAndCreateRoom(page, convex);
    testRoomCode = roomCode;

    const paragraphId = await convex.mutation(api.testingFunctions.ensureTestParagraph, {
      content: TEST_PARAGRAPH_MAPS_TO,
      title: "Test Maps-To Arrow",
    });

    await convex.mutation(api.testingFunctions.startTestGame, {
      roomCode,
      specificParagraphId: paragraphId,
    });

    await page.waitForSelector("text=Type Harder!", { timeout: 10000 });
    await typeTextWithUnicode(page, TEST_PARAGRAPH_MAPS_TO, UNICODE_MAPS.mapsTo);
    await expect(page.locator("text=Race completed!")).toBeVisible({ timeout: 5000 });

    const finalRoom = await convex.query(api.games.getRoom, { roomCode });
    const myPlayer = (finalRoom as any).game.players.find((p: any) => p.userId === userId);
    const expectedWords = TEST_PARAGRAPH_MAPS_TO.split(/\s+/).length;
    expect(myPlayer.wordsCompleted).toBeGreaterThanOrEqual(expectedWords - 1);
  });
});
