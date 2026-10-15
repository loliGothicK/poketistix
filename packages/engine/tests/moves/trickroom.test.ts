import { test, expect } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Move: Trick Room toggles on and off with turn counter tracking", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "hatterene", moves: ["trickroom", "sleeptalk"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "jolteon", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );

  // Turn 1: Hatterene sets Trick Room (starts at 5, decrements to 4 at end of turn)
  const first = env.executeTurn("move trickroom, move sleeptalk", "move sleeptalk, move sleeptalk");
  env.assertStateMatch(first.engineState, env.sim);
  expect(first.engineState.trick_room).toBe(true);
  expect(first.engineState.trick_room_turns_left).toBe(4);

  // Turn 2: Hatterene uses Trick Room again to toggle it off immediately
  const second = env.executeTurn(
    "move trickroom, move sleeptalk",
    "move sleeptalk, move sleeptalk",
  );
  env.assertStateMatch(second.engineState, env.sim);
  expect(second.engineState.trick_room).toBe(false);
  expect(second.engineState.trick_room_turns_left).toBe(0);
});

test("Move: Trick Room naturally counts down and expires after 5 turns", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "hatterene", moves: ["trickroom", "sleeptalk"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "jolteon", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );

  // Turn 1: Trick Room is activated
  const t1 = env.executeTurn("move trickroom, move sleeptalk", "move sleeptalk, move sleeptalk");
  env.assertStateMatch(t1.engineState, env.sim);
  expect(t1.engineState.trick_room).toBe(true);
  expect(t1.engineState.trick_room_turns_left).toBe(4);

  // Turn 2: 1 turn elapsed
  const t2 = env.executeTurn("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  env.assertStateMatch(t2.engineState, env.sim);
  expect(t2.engineState.trick_room).toBe(true);
  expect(t2.engineState.trick_room_turns_left).toBe(3);

  // Turn 3: 2 turns elapsed
  const t3 = env.executeTurn("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  env.assertStateMatch(t3.engineState, env.sim);
  expect(t3.engineState.trick_room).toBe(true);
  expect(t3.engineState.trick_room_turns_left).toBe(2);

  // Turn 4: 3 turns elapsed
  const t4 = env.executeTurn("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  env.assertStateMatch(t4.engineState, env.sim);
  expect(t4.engineState.trick_room).toBe(true);
  expect(t4.engineState.trick_room_turns_left).toBe(1);

  // Turn 5: 4 turns elapsed -> Trick Room expires at end of turn!
  const t5 = env.executeTurn("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  env.assertStateMatch(t5.engineState, env.sim);
  expect(t5.engineState.trick_room).toBe(false);
  expect(t5.engineState.trick_room_turns_left).toBe(0);

  // Turn 6: Field remains normal
  const t6 = env.executeTurn("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  env.assertStateMatch(t6.engineState, env.sim);
  expect(t6.engineState.trick_room).toBe(false);
  expect(t6.engineState.trick_room_turns_left).toBe(0);
});

test("Move: Trick Room reverses action order by effective speed", () => {
  const env = new TestEnvironment(
    [
      // Snorlax: Base Speed 30 (Slow)
      pokemon({ species: "snorlax", moves: ["facade", "sleeptalk"] }),
      // Hatterene: Base Speed 29 (Trick Room Setter)
      pokemon({ species: "hatterene", moves: ["trickroom", "sleeptalk"] }),
    ],
    [
      // Jolteon: Base Speed 130 (Fast)
      pokemon({ species: "jolteon", moves: ["facade", "sleeptalk"] }),
      // Clefable: Support
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );

  const getFacadeAttackerOrder = (logs: any[]) =>
    logs
      .filter((e) => e.event.type === "MoveUsed" && e.event.move_id === "facade")
      .map((e) => e.event.attacker.player);

  // Turn 1: Normal conditions -> Fast Jolteon (P2) must move BEFORE Slow Snorlax (P1)
  const t1 = env.executeTurn("move facade 2, move sleeptalk", "move facade 1, move sleeptalk");
  env.assertStateMatch(t1.engineState, env.sim);
  const t1Order = getFacadeAttackerOrder(t1.engineLogs);
  expect(t1Order).toEqual([2, 1]); // P2 Jolteon first, then P1 Snorlax

  // Turn 2: Hatterene sets Trick Room
  const t2 = env.executeTurn("move sleeptalk, move trickroom", "move sleeptalk, move sleeptalk");
  env.assertStateMatch(t2.engineState, env.sim);
  expect(t2.engineState.trick_room).toBe(true);

  // Turn 3: Under Trick Room -> Slow Snorlax (P1) must move BEFORE Fast Jolteon (P2)
  const t3 = env.executeTurn("move facade 2, move sleeptalk", "move facade 1, move sleeptalk");
  env.assertStateMatch(t3.engineState, env.sim);
  const t3Order = getFacadeAttackerOrder(t3.engineLogs);
  expect(t3Order).toEqual([1, 2]); // P1 Snorlax first, then P2 Jolteon (Order reversed!)

  // Turn 4, 5, 6: Pass turns until Trick Room expires
  env.executeTurn("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk"); // TR left: 2
  env.executeTurn("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk"); // TR left: 1
  const t6 = env.executeTurn("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk"); // TR expires!
  env.assertStateMatch(t6.engineState, env.sim);
  expect(t6.engineState.trick_room).toBe(false);

  // Turn 7: Normal conditions restored -> Fast Jolteon (P2) must move BEFORE Slow Snorlax (P1) again
  const t7 = env.executeTurn("move facade 2, move sleeptalk", "move facade 1, move sleeptalk");
  env.assertStateMatch(t7.engineState, env.sim);
  const t7Order = getFacadeAttackerOrder(t7.engineLogs);
  expect(t7Order).toEqual([2, 1]); // P2 Jolteon first again!
});
