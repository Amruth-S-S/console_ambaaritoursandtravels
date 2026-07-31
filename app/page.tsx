"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const u = localStorage.getItem("user");
    router.replace(u ? "/dashboard" : "/login");
  }, [router]);
  return null;
}
