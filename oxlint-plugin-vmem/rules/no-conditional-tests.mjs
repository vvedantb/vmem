import { toPosix } from "../utils.mjs";

const message =
  "Avoid conditional `expect(...)` calls. Split the test or assert both " +
  "branches explicitly so a false condition cannot silently skip assertions.";

function isTestLike(filename) {
  const posix = toPosix(filename);
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(posix) ||
    /\/__tests__\//.test(posix) ||
    /\/tests\//.test(posix)
  );
}

function getCallName(callee) {
  if (!callee) return undefined;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
    // expect(...).toBe — still report on expect itself via CallExpression on expect
    return callee.property.name;
  }
  return undefined;
}

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.();
    if (!isTestLike(filename)) return {};

    let conditionalDepth = 0;
    const enter = () => {
      conditionalDepth += 1;
    };
    const exit = () => {
      conditionalDepth -= 1;
    };

    return {
      CallExpression(node) {
        if (conditionalDepth === 0) return;
        // Only the bare `expect(...)` call — not `.toBe` member calls.
        if (node.callee?.type !== "Identifier") return;
        if (getCallName(node.callee) !== "expect") return;
        context.report({ node, message });
      },
      IfStatement: enter,
      "IfStatement:exit": exit,
      ConditionalExpression: enter,
      "ConditionalExpression:exit": exit,
      LogicalExpression: enter,
      "LogicalExpression:exit": exit,
      SwitchCase: enter,
      "SwitchCase:exit": exit,
    };
  },
};
