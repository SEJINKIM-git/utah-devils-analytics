"use client";

import { useEffect } from "react";
import { useCommand } from "@/app/components/command/CommandProvider";

/** 화면이 현재 위치의 마지막 칸(선수 이름 등)을 알려 준다. 아무것도 그리지 않는다. */
export default function CrumbLeaf({ label }: { label: string }) {
  const { setCrumbLeaf } = useCommand();
  useEffect(() => {
    setCrumbLeaf(label);
    return () => setCrumbLeaf(null);
  }, [label, setCrumbLeaf]);
  return null;
}
