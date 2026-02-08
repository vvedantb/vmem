// Shared in-memory store for API keys mock data
// This simulates a database for development purposes

export interface ApiKey {
  id: string;
  name: string;
  key: string; // Full key (only shown once on creation)
  maskedKey: string; // Masked version (vmem_sk_***a3f2)
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  status: "active" | "revoked";
}

// Generate a random API key
export function generateApiKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "vmem_sk_";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Mask an API key to show only last 4 characters
export function maskApiKey(key: string): string {
  if (key.length <= 12) return key;
  return key.slice(0, 8) + "**********************" + key.slice(-4);
}

// Initial mock data
export const apiKeys: ApiKey[] = [
  {
    id: "key_1",
    name: "Production App",
    key: "vmem_sk_prod1234567890abcdef12345a3f2",
    maskedKey: "vmem_sk_**********************a3f2",
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    requestCount: 1247,
    status: "active",
  },
  {
    id: "key_2",
    name: "Development",
    key: "vmem_sk_dev98765432109876543210b7c1",
    maskedKey: "vmem_sk_**********************b7c1",
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    lastUsedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    requestCount: 523,
    status: "active",
  },
  {
    id: "key_3",
    name: "Testing (Revoked)",
    key: "vmem_sk_test1234567890abcdef12345c8d3",
    maskedKey: "vmem_sk_**********************c8d3",
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
    lastUsedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
    requestCount: 89,
    status: "revoked",
  },
];
