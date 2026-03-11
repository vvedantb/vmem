import neo4j, { Driver } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI;
  if (!uri) {
    throw new Error(
      "NEO4J_URI environment variable is required but not set. Please configure it before starting the server.",
    );
  }
  const user = process.env.NEO4J_USERNAME ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD ?? "";

  if (!uri) {
    console.error(
      "Neo4j: NEO4J_URI environment variable is not set; connection will fail",
    );
    throw new Error(
      "NEO4J_URI is not configured. Set the NEO4J_URI environment variable.",
    );
  }

  driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  return driver;
}

export async function verifyConnectivity(): Promise<void> {
  const d = getDriver();
  try {
    await d.verifyConnectivity();
  } catch (err) {
    driver = null;
    throw new Error(
      `Neo4j connection failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
