"use client";

import { useState } from "react";
import { Eye, EyeOff, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiKeyDisplayProps = {
  value: string;
};

export function ApiKeyDisplay({ value }: ApiKeyDisplayProps) {
  const [draft, setDraft] = useState(value);
  const [isEditing, setIsEditing] = useState(!value);
  const [isVisible, setIsVisible] = useState(false);
  const isConfigured = Boolean(value);
  const canSubmit = draft.trim().length > 0 && draft !== value;
  const displayValue = isVisible ? value : "****";

  return (
    <div className="mt-5 flex flex-col gap-3">
      <label className="text-sm font-medium text-slate-700">
        {isConfigured ? "当前 API Key" : "API Key"}
      </label>

      {isConfigured && !isEditing ? (
        <div className="flex flex-col gap-3">
          <p className="break-all font-mono text-sm leading-6 text-slate-700">
            {displayValue}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setIsVisible((current) => !current)}
            >
              {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {isVisible ? "隐藏" : "查看"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setDraft(value);
                setIsEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              编辑
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Input
            name="apiKey"
            type={isVisible ? "text" : "password"}
            value={draft}
            placeholder="Rebrickable API Key"
            className="w-full font-mono"
            aria-label="当前 API Key"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex gap-2">
            {isConfigured ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setIsVisible((current) => !current)}
              >
                {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {isVisible ? "隐藏" : "查看"}
              </Button>
            ) : null}
            {isConfigured ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft(value);
                  setIsEditing(false);
                  setIsVisible(false);
                }}
              >
                取消
              </Button>
            ) : null}
            <Button type="submit" disabled={!canSubmit}>
              {isConfigured ? "更新 API Key" : "保存 API Key"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
