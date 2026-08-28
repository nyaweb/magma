export const ACTS = {
  container: (n) => n.item.protected ? ["inspect"] : ["commit", "stamp", "evolve", n.item.running ? "stop" : "start", "inspect", "rm"],
  image: (n) => n.item.protected ? ["run", "spawn", "inspect"] : ["run", "spawn", "inspect", "rm"],
  stack: () => ["edit", "up", "down", "inspect", "rm"],
};

export const confirmRm = (ask = globalThis.confirm) => !!ask?.("¿borrar este orbe?");
