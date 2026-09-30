'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  normalizeAutomationScenario,validateAutomationSteps,automationTemplates,summarizeAutomationStep
}=require('../app/lib/automation-v2');

test('Automation 2.0 normalizes retry, timeout and target selectors',()=>{
  const scenario=normalizeAutomationScenario({name:'Lab',steps:[
    {id:'one',type:'machine-action',tag:'test',action:'shutdown',retries:3,retryDelaySeconds:7,timeoutMinutes:12},
    {id:'two',type:'wait-until',group:'Lab',state:'stopped',dependsOn:['one']}
  ]});
  assert.equal(scenario.steps[0].target.kind,'tag');
  assert.equal(scenario.steps[0].retry.attempts,3);
  assert.equal(scenario.steps[0].timeoutMinutes,12);
  assert.equal(scenario.steps[1].target.kind,'group');
  assert.equal(validateAutomationSteps(scenario.steps).ok,true);
});

test('Automation 2.0 validates dependencies in execution order',()=>{
  const scenario=normalizeAutomationScenario({name:'bad',steps:[
    {id:'one',type:'wait',seconds:1,dependsOn:['later']},
    {id:'later',type:'wait',seconds:1}
  ]});
  const result=validateAutomationSteps(scenario.steps);
  assert.equal(result.ok,false);
  assert.match(result.error,/Dépendance inconnue/);
});

test('Automation 2.0 validates Docker and conditional branches',()=>{
  const scenario=normalizeAutomationScenario({name:'Docker',steps:[
    {id:'cond',type:'condition',condition:{kind:'always'},then:[
      {id:'stack',type:'docker-action',scope:'stack',portainerId:'p1',endpointId:2,targetId:'44',action:'stop'}
    ],else:[{id:'pause',type:'wait',seconds:2}]}
  ]});
  assert.equal(validateAutomationSteps(scenario.steps).ok,true);
});

test('Automation templates expose reusable scenarios',()=>{
  const templates=automationTemplates();
  assert.ok(templates.length>=3);
  assert.ok(templates.some(x=>x.id==='lab-maintenance'));
  assert.match(summarizeAutomationStep(templates[0].steps[0]),/start/i);
});

test('Automation 2.0 caps deeply nested conditions instead of overflowing the call stack',()=>{
  let deepest={id:'leaf',type:'wait',seconds:1};
  for(let i=0;i<5000;i++){
    deepest={id:`cond-${i}`,type:'condition',condition:{kind:'always'},then:[deepest],else:[]};
  }
  const scenario=normalizeAutomationScenario({name:'deep',steps:[deepest]});
  assert.equal(validateAutomationSteps(scenario.steps).ok,true);
  let node=scenario.steps[0],depth=0;
  while(node?.type==='condition'&&node.then.length){node=node.then[0];depth++;}
  assert.ok(depth<=20,`nesting should be capped, got depth ${depth}`);
});
