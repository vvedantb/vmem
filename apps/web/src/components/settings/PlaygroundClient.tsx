"use client";

import { useCallback, useEffect, useReducer } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Button } from "@vmem/ui";
import {
  IconPlugConnected,
  IconPlugConnectedX,
  IconPlayerPlay,
  IconLoader2,
} from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { env } from "@/env";

const MCP_BASE = env.VITE_CONVEX_URL.replace(".convex.cloud", ".convex.site");

interface ToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface PlaygroundState {
  status: ConnectionStatus;
  tools: ToolInfo[];
  selectedTool: string;
  paramValues: Record<string, string>;
  result: string;
  error: string;
  running: boolean;
}

type PlaygroundAction =
  | { type: "SET_STATUS"; status: ConnectionStatus }
  | { type: "SET_TOOLS"; tools: ToolInfo[] }
  | { type: "SELECT_TOOL"; name: string }
  | { type: "SET_PARAM"; key: string; value: string }
  | { type: "SET_RESULT"; result: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_RUNNING"; running: boolean }
  | { type: "RESET" };

function reducer(
  state: PlaygroundState,
  action: PlaygroundAction,
): PlaygroundState {
  switch (action.type) {
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "SET_TOOLS":
      return { ...state, tools: action.tools };
    case "SELECT_TOOL":
      return {
        ...state,
        selectedTool: action.name,
        paramValues: {},
        result: "",
        error: "",
      };
    case "SET_PARAM":
      return {
        ...state,
        paramValues: { ...state.paramValues, [action.key]: action.value },
      };
    case "SET_RESULT":
      return { ...state, result: action.result, error: "", running: false };
    case "SET_ERROR":
      return { ...state, error: action.error, result: "", running: false };
    case "SET_RUNNING":
      return { ...state, running: action.running };
    case "RESET":
      return initialState;
  }
}

const initialState: PlaygroundState = {
  status: "disconnected",
  tools: [],
  selectedTool: "",
  paramValues: {},
  result: "",
  error: "",
  running: false,
};

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let storedClient: Client | null = null;

export default function PlaygroundClient() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleConnect = useCallback(async () => {
    dispatch({ type: "SET_STATUS", status: "connecting" });
    dispatch({ type: "SET_ERROR", error: "" });

    try {
      const metaRes = await fetch(
        `${MCP_BASE}/.well-known/oauth-authorization-server`,
      );
      const meta = await metaRes.json();

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const oauthState = crypto.randomUUID();

      const regRes = await fetch(meta.registration_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_types: ["authorization_code"],
          response_types: ["code"],
          redirect_uris: [
            `${window.location.origin}/settings/playground/callback`,
          ],
          token_endpoint_auth_method: "none",
        }),
      });
      const regData = await regRes.json();
      const clientId = regData.client_id as string;

      const redirectUri = `${window.location.origin}/settings/playground/callback`;
      const authUrl = new URL(meta.authorization_endpoint);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", oauthState);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("response_type", "code");

      const popup = window.open(
        authUrl.toString(),
        "mcp-oauth",
        "width=500,height=700,popup=yes",
      );

      const code = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(
            new Error("OAuth timeout — popup was closed or took too long"),
          );
        }, 120_000);

        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            cleanup();
            reject(new Error("Popup closed before completing sign-in"));
          }
        }, 1000);

        function onMessage(event: MessageEvent) {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type !== "mcp-oauth-callback") return;
          if (event.data.state !== oauthState) return;
          cleanup();
          resolve(event.data.code as string);
        }

        function cleanup() {
          clearTimeout(timeout);
          clearInterval(checkClosed);
          window.removeEventListener("message", onMessage);
        }

        window.addEventListener("message", onMessage);
      });

      popup?.close();

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: clientId,
      });

      const tokenRes = await fetch(meta.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error_description ?? "Token exchange failed");
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token as string;

      const transport = new StreamableHTTPClientTransport(
        new URL("/mcp", MCP_BASE),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        },
      );

      const client = new Client({ name: "vmem-playground", version: "1.0.0" });
      await client.connect(transport);
      storedClient = client;

      const toolsResult = await client.listTools();
      const tools: ToolInfo[] = toolsResult.tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      }));

      dispatch({ type: "SET_TOOLS", tools });
      dispatch({ type: "SET_STATUS", status: "connected" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      dispatch({ type: "SET_ERROR", error: message });
      dispatch({ type: "SET_STATUS", status: "disconnected" });
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    storedClient?.close();
    storedClient = null;
    dispatch({ type: "RESET" });
  }, []);

  const handleRun = useCallback(async () => {
    if (!storedClient || !state.selectedTool) return;

    dispatch({ type: "SET_RUNNING", running: true });
    dispatch({ type: "SET_ERROR", error: "" });

    try {
      const tool = state.tools.find((t) => t.name === state.selectedTool);
      const properties = (tool?.inputSchema?.properties ?? {}) as Record<
        string,
        { type?: string }
      >;

      const args: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(state.paramValues)) {
        if (value === "") continue;

        const propDef = properties[key];
        if (propDef?.type === "number") {
          args[key] = Number(value);
        } else if (propDef?.type === "array") {
          try {
            args[key] = JSON.parse(value);
          } catch {
            args[key] = value.split(",").map((s) => s.trim());
          }
        } else {
          args[key] = value;
        }
      }

      const result = await storedClient.callTool({
        name: state.selectedTool,
        arguments: args,
      });

      dispatch({
        type: "SET_RESULT",
        result: JSON.stringify(result, null, 2),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tool execution failed";
      dispatch({ type: "SET_ERROR", error: message });
    }
  }, [state.selectedTool, state.paramValues, state.tools]);

  useEffect(() => {
    return () => {
      storedClient?.close();
      storedClient = null;
    };
  }, []);

  const selectedToolInfo = state.tools.find(
    (t) => t.name === state.selectedTool,
  );
  const paramProperties = (selectedToolInfo?.inputSchema?.properties ??
    {}) as Record<string, { type?: string; description?: string }>;
  const requiredParams = (selectedToolInfo?.inputSchema?.required ??
    []) as string[];

  return (
    <PageContainer
      title="Playground"
      centeredMaxWidth
      rightSection={
        state.status === "connected" ? (
          <Button variant="outline" onClick={handleDisconnect}>
            <IconPlugConnectedX size={16} className="mr-1.5" />
            Disconnect
          </Button>
        ) : undefined
      }
    >
      {state.status === "disconnected" && (
        <div className="py-16 text-center">
          <IconPlugConnected
            size={48}
            className="mx-auto text-muted mb-4"
            stroke={1.5}
          />
          <h3 className="text-lg font-medium text-foreground mb-2">
            MCP Playground
          </h3>
          <p className="text-muted mb-6 max-w-md mx-auto">
            Connect to the vmem MCP server to test tools directly. This uses the
            full OAuth flow — sign in with your vmem account.
          </p>
          <Button onClick={handleConnect}>Connect to MCP</Button>
          {state.error && (
            <p className="text-danger text-sm mt-4">{state.error}</p>
          )}
        </div>
      )}

      {state.status === "connecting" && (
        <div className="py-16 text-center">
          <IconLoader2
            size={32}
            className="mx-auto text-muted mb-4 animate-spin"
            stroke={1.5}
          />
          <p className="text-muted text-sm">
            Connecting... complete sign-in in the popup window.
          </p>
        </div>
      )}

      {state.status === "connected" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Tool
              </label>
              <select
                value={state.selectedTool}
                onChange={(e) =>
                  dispatch({ type: "SELECT_TOOL", name: e.target.value })
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select a tool...</option>
                {state.tools.map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedToolInfo && (
              <>
                <p className="text-sm text-muted">
                  {selectedToolInfo.description}
                </p>

                {Object.entries(paramProperties).map(([key, prop]) => (
                  <div key={key}>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      {key}
                      {requiredParams.includes(key) && (
                        <span className="text-danger ml-0.5">*</span>
                      )}
                    </label>
                    {prop.description && (
                      <p className="text-xs text-muted mb-1">
                        {prop.description}
                      </p>
                    )}
                    {prop.type === "array" ? (
                      <input
                        type="text"
                        value={state.paramValues[key] ?? ""}
                        onChange={(e) =>
                          dispatch({
                            type: "SET_PARAM",
                            key,
                            value: e.target.value,
                          })
                        }
                        placeholder='["tag1", "tag2"] or tag1, tag2'
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    ) : (
                      <input
                        type={prop.type === "number" ? "number" : "text"}
                        value={state.paramValues[key] ?? ""}
                        onChange={(e) =>
                          dispatch({
                            type: "SET_PARAM",
                            key,
                            value: e.target.value,
                          })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    )}
                  </div>
                ))}

                <Button
                  onClick={handleRun}
                  disabled={state.running}
                  className="w-full"
                >
                  {state.running ? (
                    <IconLoader2 size={16} className="mr-1.5 animate-spin" />
                  ) : (
                    <IconPlayerPlay size={16} className="mr-1.5" />
                  )}
                  {state.running ? "Running..." : "Run"}
                </Button>
              </>
            )}
          </div>

          <div className="min-h-[200px] sm:min-h-[300px]">
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Result
            </label>
            {state.error && (
              <div className="rounded-md border border-danger/50 bg-danger/10 p-4">
                <p className="text-sm text-danger">{state.error}</p>
              </div>
            )}
            {state.result && (
              <pre className="rounded-md border border-border bg-surface-secondary/50 p-4 text-sm text-foreground overflow-auto max-h-[600px] whitespace-pre-wrap">
                {state.result}
              </pre>
            )}
            {!state.error && !state.result && (
              <div className="rounded-md border border-border bg-surface-secondary/30 p-4 h-[200px] sm:h-[300px] flex items-center justify-center">
                <p className="text-sm text-muted">
                  Select a tool and run it to see results here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
