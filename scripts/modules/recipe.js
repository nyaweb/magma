export const APT = "apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*";

export const recipe = (from = "debian:bookworm-slim") => `FROM ${from}\nRUN ${APT}\nCMD ["sleep", "infinity"]\n`;

export const assertFrom = (df) => {
  const firstInstruction = String(df || "").split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("#"));
  if (!/^FROM\s+\S+/i.test(firstInstruction || "")) throw new Error("Dockerfile sin FROM");
  return df;
};

export const prepExec = (exec) => exec === true || exec === "apt" ? APT : (typeof exec === "string" && exec.trim() ? exec.trim() : "");
