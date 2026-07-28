import { Octokit } from "@octokit/core";
import { retry } from "@octokit/plugin-retry";

const GITHUB_API_VERSION = "2022-11-28";

const GithubOctokit = Octokit.plugin(retry);

export type GithubOctokitClient = InstanceType<typeof GithubOctokit>;

// shared octokit client with bearer auth and automatic retries
export function createGithubOctokit(token: string): GithubOctokitClient {
  return new GithubOctokit({
    auth: token,
    request: {
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  });
}
