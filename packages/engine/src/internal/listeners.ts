export type Listener<T> = (val: T) => void;

export function makeSet<T>() {
  const set = new Set<Listener<T>>();
  return {
    add(fn: Listener<T>) {
      set.add(fn);
      return () => { set.delete(fn); };
    },
    emit(val: T) {
      for (const fn of set) fn(val);
    },
  };
}
