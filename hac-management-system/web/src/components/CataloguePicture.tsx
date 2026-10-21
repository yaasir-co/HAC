"use client";
import { useState } from "react";
import { Building2, Package } from "lucide-react";
export default function CataloguePicture({
  src,
  name,
  company = false,
}: {
  src?: string | null;
  name: string;
  company?: boolean;
}) {
  const [failed, setFailed] = useState("");
  return (
    <span className={`catalogue-picture ${company ? "company-picture" : ""}`}>
      {src && failed !== src ? (
        <img
          loading="lazy"
          src={src}
          alt={company ? `${name} logo` : `${name} photo`}
          onError={() => setFailed(src)}
        />
      ) : company ? (
        <Building2 size={24} />
      ) : (
        <Package size={24} />
      )}
    </span>
  );
}
