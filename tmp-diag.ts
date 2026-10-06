import { bootWorld, mustDispatch, advanceUntilDead, advanceToAge, activeCharacterId, isArchived } from "./tests/helpers/modern.ts";
{
  const { simulation, characterId } = bootWorld({ seed: 104, startingCash: 20000, lifespan: 85 });
  mustDispatch(simulation, { type: "career.start_business", actorId: characterId, payload: { name: "Stone Atelier", capital: 5000 } });
  console.log("10) age22:", advanceToAge(simulation, characterId, 22), "archived:", isArchived(simulation, characterId));
  console.log("   marry:", JSON.stringify(simulation.dispatch({type:"family.marry",actorId:characterId,payload:{spouseName:"Cy"}}).errors));
  console.log("   child:", JSON.stringify(simulation.dispatch({type:"family.have_child",actorId:characterId,payload:{givenName:"Dan",lifespan:85}}).errors));
  console.log("   gen1 dead:", advanceUntilDead(simulation, characterId));
  const s1 = simulation.dispatch({ type: "modern.switch_generation" });
  const gen2 = activeCharacterId(simulation);
  console.log("   switch1:", s1.ok, JSON.stringify(s1.errors), "gen2:", gen2);
  console.log("   gen2 age19:", advanceToAge(simulation, gen2, 19), "archived:", isArchived(simulation, gen2), "tick:", simulation.tick);
  console.log("   marry2:", JSON.stringify(simulation.dispatch({type:"family.marry",actorId:gen2,payload:{spouseName:"Rin"}}).errors));
  console.log("   child2:", JSON.stringify(simulation.dispatch({type:"family.have_child",actorId:gen2,payload:{givenName:"Fen",lifespan:85}}).errors));
  console.log("   gen2 dead:", advanceUntilDead(simulation, gen2));
  const s2 = simulation.dispatch({ type: "modern.switch_generation" });
  console.log("   switch2:", s2.ok, JSON.stringify(s2.errors), "gen3:", activeCharacterId(simulation));
  console.log("   members:", JSON.stringify(simulation.history.lineage("family:lineage:1")?.members));
}
{
  const { simulation, characterId } = bootWorld({ seed: 105, lifespan: 70 });
  const r = simulation.dispatch({ type: "career.start_business", actorId: characterId, payload: { name: "Stone Atelier", capital: 5000 } });
  const recs = simulation.history.listRecords({entityId: characterId});
  const f = recs.find(x=>x.type==="career.business_founded");
  console.log("11) founding record:", JSON.stringify(f));
  const e = simulation.history.explain(f.eventId);
  console.log("   explanation:", JSON.stringify({type:e?.type, commandId:e?.commandId, causes:e?.causes.map(c=>c.type)}));
}
