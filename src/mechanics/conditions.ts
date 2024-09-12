import { Applier, Handler } from ".";
import { Context } from "../context";

export const Conditions: { [id: string]: Partial<Applier & Handler<Context>> } =
  {};
