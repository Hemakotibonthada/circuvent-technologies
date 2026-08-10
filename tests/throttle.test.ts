import { renderHook, act } from "@testing-library/react";
import { useThrottled } from "../mobile/src/throttle";

/*
 * Dragging the colour pointer or the brightness slider fires an event per
 * frame. Two things have to hold, and they pull against each other:
 *
 *   - the device must not be sent sixty commands a second, or it falls behind
 *     and keeps changing after your finger has stopped;
 *   - the value you released on must be the value it ends up at.
 *
 * A plain throttle gets the first and loses the second, which is the subtle
 * one: the light lands on whichever intermediate value happened to fall on a
 * window boundary, and it is close enough to the one you picked that it reads
 * as the hardware being imprecise rather than the app dropping it.
 */
describe("useThrottled", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("sends the first value immediately", () => {
    const sent: number[] = [];
    const { result } = renderHook(() => useThrottled<number>((v) => sent.push(v), 100));

    act(() => result.current(1));
    expect(sent).toEqual([1]);
  });

  it("drops the middle of a burst", () => {
    const sent: number[] = [];
    const { result } = renderHook(() => useThrottled<number>((v) => sent.push(v), 100));

    act(() => {
      for (let i = 1; i <= 20; i++) result.current(i);
    });

    /* One leading call; the other 19 are collapsed. */
    expect(sent).toEqual([1]);
  });

  /* The whole point. */
  it("still delivers the value it ended on", () => {
    const sent: number[] = [];
    const { result } = renderHook(() => useThrottled<number>((v) => sent.push(v), 100));

    act(() => {
      for (let i = 1; i <= 20; i++) result.current(i);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(sent[sent.length - 1]).toBe(20);
  });

  it("lets a later, separate change through", () => {
    const sent: number[] = [];
    const { result } = renderHook(() => useThrottled<number>((v) => sent.push(v), 100));

    act(() => result.current(1));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => result.current(2));

    expect(sent).toEqual([1, 2]);
  });

  /*
   * Leaving the screen mid-drag would otherwise fire into an unmounted
   * component a moment later.
   */
  it("does not fire after unmount", () => {
    const sent: number[] = [];
    const { result, unmount } = renderHook(() =>
      useThrottled<number>((v) => sent.push(v), 100)
    );

    act(() => {
      result.current(1);
      result.current(2);
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(sent).toEqual([1]);
  });

  /*
   * The callback is read through a ref, so a component that re-renders with a
   * new closure mid-drag — which is every render, since these are inline
   * arrows — still sends through the current one.
   */
  it("uses the latest callback, not the one it was created with", () => {
    const first: number[] = [];
    const second: number[] = [];
    let target = first;

    const { result, rerender } = renderHook(() =>
      useThrottled<number>((v) => target.push(v), 100)
    );

    act(() => result.current(1));
    target = second;
    rerender();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => result.current(2));

    expect(first).toEqual([1]);
    expect(second).toEqual([2]);
  });
});
