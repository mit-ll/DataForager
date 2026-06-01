// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

// src/hooks/useContainerSize.js
import { useState, useEffect, useRef } from 'react';

/**
 * NOT CURRENTLY USED;
 * A function that could help make the vis container
 * dynamically adjust size based on the browswer window
 */
export function useContainerSize() {

  const ref = useRef();
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
