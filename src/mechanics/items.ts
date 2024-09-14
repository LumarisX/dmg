import {Applier, Handler} from '.';
import {Context} from '../context';
import {is} from '../utils';

export const Items: {
  [id: string]: Partial<Applier & Handler<Context.Pokemon>>;
} = {
  absorbbulb: {
    //   onDamagingHit(damage, target, source, move) {
    //     if (move.type === 'Water') {
    //       target.useItem();
    //     }
    //   },
  },
  adamantorb: {
    onBasePower(pokemon: Context.Pokemon) {
      if (pokemon.species.name === 'Dialga' && (is(pokemon.move?.type, 'Steel') || is(pokemon.move?.type, 'Dragon'))) {
        return 0x1333;
      }
    },
  },
  adrenalineorb: {
    //   onAfterBoost(boost, target, source, effect) {
    //     if (effect.id === 'intimidate') {
    //       target.useItem();
    //     }
    //   },
  },
  aguavberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(pokemon.baseMaxhp * 0.33);
    //     if (pokemon.getNature().minus === 'spd') {
    //       pokemon.addVolatile('confusion');
    //     }
    //   },
  },
  airballoon: {
    //   onStart(target) {
    //     if (!target.ignoringItem() && !this.field.getPseudoWeather('gravity')) {
    //       this.add('-item', target, 'Air Balloon');
    //     }
    //   },
    //   onDamagingHit(damage, target, source, move) {
    //     this.add('-enditem', target, 'Air Balloon');
    //     target.item = '';
    //     target.itemData = {id: '', target};
    //     this.runEvent('AfterUseItem', target, null, null, this.dex.getItem('airballoon'));
    //   },
    //   onAfterSubDamage(damage, target, source, effect) {
    //     this.debug('effect: ' + effect.id);
    //     if (effect.effectType === 'Move') {
    //       this.add('-enditem', target, 'Air Balloon');
    //       target.item = '';
    //       target.itemData = {id: '', target};
    //       this.runEvent('AfterUseItem', target, null, null, this.dex.getItem('airballoon'));
    //     }
    //   },
  },
  apicotberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     this.boost({spd: 1});
    //   },
  },
  aspearberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'frz') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'frz') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  assaultvest: {
    onModifySpD() {
      return 0x1800;
    },
    //   onDisableMove(pokemon) {
    //     for (const moveSlot of pokemon.moveSlots) {
    //       if (this.dex.getMove(moveSlot.move).category === 'Status') {
    //         pokemon.disableMove(moveSlot.id);
    //       }
    //     }
    //   },
  },
  babiriberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Steel') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  berryjuice: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 2) {
    //       if (this.runEvent('TryHeal', pokemon) && pokemon.useItem()) {
    //         this.heal(20);
    //       }
    //     }
    //   },
  },
  bigroot: {
    //   onTryHeal(damage, target, source, effect) {
    //     const heals = ['drain', 'leechseed', 'ingrain', 'aquaring', 'strengthsap'];
    //     if (heals.includes(effect.id)) {
    //       return this.chainModify([0x14CC, 0x1000]);
    //     }
    //   },
  },
  blackbelt: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Fighting')) {
        return 0x1333;
      }
    },
  },
  blacksludge: {
    //   onResidual(pokemon) {
    //     if (this.field.isTerrain('grassyterrain')) { return; }
    //     if (pokemon.hasType('Poison')) {
    //       this.heal(pokemon.baseMaxhp / 16);
    //     } else {
    //       this.damage(pokemon.baseMaxhp / 8);
    //     }
    //   },
    //   onTerrain(pokemon) {
    //     if (!this.field.isTerrain('grassyterrain')) { return; }
    //     if (pokemon.hasType('Poison')) {
    //       this.heal(pokemon.baseMaxhp / 16);
    //     } else {
    //       this.damage(pokemon.baseMaxhp / 8);
    //     }
    //   },
  },
  blackglasses: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Dark')) {
        return 0x1333;
      }
    },
  },
  blueorb: {
    //   onSwitchIn(pokemon) {
    //     if (pokemon.isActive && pokemon.baseSpecies.name === 'Kyogre') {
    //       this.queue.insertChoice({choice: 'runPrimal', pokemon: pokemon});
    //     }
    //   },
    //   onPrimal(pokemon) {
    //     pokemon.formeChange('Kyogre-Primal', this.effect, true);
    //   },
    //   onTakeItem(item, source) {
    //     if (source.baseSpecies.baseSpecies === 'Kyogre') { return false; }
    //     return true;
    //   },
  },
  brightpowder: {
    //   onModifyAccuracy(accuracy) {
    //     if (typeof accuracy !== 'number') { return; }
    //     this.debug('brightpowder - decreasing accuracy');
    //     return accuracy * 0.9;
    //   },
  },
  buggem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Bug' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  bugmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  burndrive: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 649) || pokemon.baseSpecies.num === 649) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  cellbattery: {
    //   onDamagingHit(damage, target, source, move) {
    //     if (move.type === 'Electric') {
    //       target.useItem();
    //     }
    //   },
  },
  charcoal: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Fire')) {
        return 0x1333;
      }
    },
  },
  chartiberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Rock') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  cheriberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'par') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'par') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  chestoberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'slp') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'slp') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  chilanberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Normal')) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move?.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  chilldrive: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 649) || pokemon.baseSpecies.num === 649) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  choiceband: {
    //   onStart(pokemon) {
    //     if (pokemon.volatiles['choicelock']) {
    //       this.debug('removing choicelock: ' + pokemon.volatiles.choicelock);
    //     }
    //     pokemon.removeVolatile('choicelock');
    //   },
    //   onModifyMove(move, pokemon) {
    //     pokemon.addVolatile('choicelock');
    //   },
    onModifyAtk(pokemon: Context.Pokemon) {
      if (pokemon.volatiles['dynamax']) {
        return;
      }
      return 0x1800;
    },
  },
  choicescarf: {
    //   onStart(pokemon) {
    //     if (pokemon.volatiles['choicelock']) {
    //       this.debug('removing choicelock: ' + pokemon.volatiles.choicelock);
    //     }
    //     pokemon.removeVolatile('choicelock');
    //   },
    //   onModifyMove(move, pokemon) {
    //     pokemon.addVolatile('choicelock');
    //   },
    onModifySpe(pokemon: Context.Pokemon) {
      if (pokemon.volatiles['dynamax']) return;
      return 0x1800;
    },
  },
  choicespecs: {
    //   onStart(pokemon) {
    //     if (pokemon.volatiles['choicelock']) {
    //       this.debug('removing choicelock: ' + pokemon.volatiles.choicelock);
    //     }
    //     pokemon.removeVolatile('choicelock');
    //   },
    //   onModifyMove(move, pokemon) {
    //     pokemon.addVolatile('choicelock');
    //   },
    onModifySpA(pokemon: Context.Pokemon) {
      if (pokemon.volatiles['dynamax']) {
        return;
      }
      return 0x1800;
    },
  },
  chopleberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move?.type, 'Fighting') && pokemon.move?.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  cobaberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Flying') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  colburberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Dark') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  custapberry: {
    //   onFractionalPriority(priority, pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       if (pokemon.eatItem()) {
    //         this.add('-activate', pokemon, 'item: Custap Berry', '[consumed]');
    //         return Math.round(priority) + 0.1;
    //       }
    //     }
    //   },
    //   onEat() { },
  },
  darkgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Dark' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  darkmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  deepseascale: {
    onModifySpD(pokemon: Context.Pokemon) {
      if (pokemon.species.name === 'Clamperl') {
        return 0x2000;
      }
    },
  },
  deepseatooth: {
    onModifySpA(pokemon: Context.Pokemon) {
      if (pokemon.species.name === 'Clamperl') {
        return 0x2000;
      }
    },
  },
  destinyknot: {
    //   onAttract(target, source) {
    //     this.debug('attract intercepted: ' + target + ' from ' + source);
    //     if (!source || source === target) { return; }
    //     if (!source.volatiles.attract) { source.addVolatile('attract', target); }
    //   },
  },
  dousedrive: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 649) || pokemon.baseSpecies.num === 649) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  dracoplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Dragon')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  dragonfang: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Dragon')) {
        return 0x1333;
      }
    },
  },
  dragongem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Dragon' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  dragonmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  dreadplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Dark')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  earthplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Ground')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  ejectbutton: {
    //   onAfterMoveSecondary(target, source, move) {
    //     if (source && source !== target && target.hp && move && move.category !== 'Status') {
    //       if (!this.canSwitch(target.side) || target.forceSwitchFlag) { return; }
    //       for (const pokemon of this.getAllActive()) {
    //         if (pokemon.switchFlag === true) { return; }
    //       }
    //       if (target.useItem()) {
    //         target.switchFlag = true;
    //         source.switchFlag = false;
    //       }
    //     }
    //   },
  },
  ejectpack: {
    //   onAfterBoost(boost, target, source, effect) {
    //     let eject = false;
    //     let i;
    //     for (i in boost) {
    //       if (boost[i] < 0) {
    //         eject = true;
    //       }
    //     }
    //     if (eject) {
    //       if (target.hp) {
    //         if (!this.canSwitch(target.side)) { return; }
    //         for (const pokemon of this.getAllActive()) {
    //           if (pokemon.switchFlag === true) { return; }
    //         }
    //         if (target.useItem()) { target.switchFlag = true; }
    //       }
    //     }
    //   },
  },
  electricgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     const pledges = ['firepledge', 'grasspledge', 'waterpledge'];
    //     if (target === source || move.category === 'Status' || pledges.includes(move.id)) { return; }
    //     if (move.type === 'Electric' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  electricmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  electricseed: {
    //   onStart(pokemon) {
    //     if (!pokemon.ignoringItem() && this.field.isTerrain('electricterrain')) {
    //       pokemon.useItem();
    //     }
    //   },
    //   onAnyTerrainStart() {
    //     const pokemon = this.effectData.target;
    //     if (this.field.isTerrain('electricterrain')) {
    //       pokemon.useItem();
    //     }
    //   },
  },
  enigmaberry: {
    //   onHit(target, source, move) {
    //     if (move && target.getMoveHitData(move).typeMod > 0) {
    //       if (target.eatItem()) {
    //         this.heal(target.baseMaxhp / 4);
    //       }
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat() { },
  },
  eviolite: {
    onModifyDef(pokemon: Context.Pokemon) {
      if (pokemon.species.nfe) {
        return 0x1800;
      }
    },
    onModifySpD(pokemon: Context.Pokemon) {
      if (pokemon.species.nfe) {
        return 0x1800;
      }
    },
  },
  expertbelt: {
    // onModifyDamageAttacker(pokemon: Context.Pokemon) {
    //     if (move && target.getMoveHitData(move).typeMod > 0) {
    //       return this.chainModify([0x1333, 0x1000]);
    //     }
    //   return undefined;
    // },
  },
  fairygem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Fairy' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  fairymemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  fightinggem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Fighting' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  fightingmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  figyberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(pokemon.baseMaxhp * 0.33);
    //     if (pokemon.getNature().minus === 'atk') {
    //       pokemon.addVolatile('confusion');
    //     }
    //   },
  },
  firegem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     const pledges = ['firepledge', 'grasspledge', 'waterpledge'];
    //     if (target === source || move.category === 'Status' || pledges.includes(move.id)) { return; }
    //     if (move.type === 'Fire' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  firememory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  fistplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Fighting')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  flameorb: {
    //   onResidual(pokemon) {
    //     pokemon.trySetStatus('brn', pokemon);
    //   },
  },
  flameplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Fire')) {
        return 0x1333;
      }
      // if (is(pokemon.move?.type, "Fire")) {
      //   return 0x1333;
      // }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  floatstone: {
    //   onModifyWeight(weighthg) {
    //     return this.trunc(weighthg / 2);
    //   },
  },
  flyinggem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Flying' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  flyingmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  focusband: {
    //   onDamage(damage, target, source, effect) {
    //     if (this.randomChance(1, 10) && damage >= target.hp && effect && effect.effectType === 'Move') {
    //       this.add("-activate", target, "item: Focus Band");
    //       return target.hp - 1;
    //     }
    //   },
  },
  focussash: {
    //   onDamage(damage, target, source, effect) {
    //     if (target.hp === target.maxhp && damage >= target.hp && effect && effect.effectType === 'Move') {
    //       if (target.useItem()) {
    //         return target.hp - 1;
    //       }
    //     }
    //   },
  },
  fullincense: {
    //   onFractionalPriority(priority, pokemon) {
    //     return Math.round(priority) - 0.1;
    //   },
  },
  ganlonberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     this.boost({def: 1});
    //   },
  },
  ghostgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Ghost' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  ghostmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  grassgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     const pledges = ['firepledge', 'grasspledge', 'waterpledge'];
    //     if (target === source || move.category === 'Status' || pledges.includes(move.id)) { return; }
    //     if (move.type === 'Grass' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  grassmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  grassyseed: {
    //   onStart(pokemon) {
    //     if (!pokemon.ignoringItem() && this.field.isTerrain('grassyterrain')) {
    //       pokemon.useItem();
    //     }
    //   },
    //   onAnyTerrainStart() {
    //     const pokemon = this.effectData.target;
    //     if (this.field.isTerrain('grassyterrain')) {
    //       pokemon.useItem();
    //     }
    //   },
  },
  griseousorb: {
    onBasePower(pokemon: Context.Pokemon) {
      if (pokemon.species.num === 487 && (is(pokemon.move?.type, 'Ghost') || is(pokemon.move?.type, 'Dragon'))) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 487) || pokemon.baseSpecies.num === 487) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  groundgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Ground' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  groundmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  habanberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Dragon') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  hardstone: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Rock')) {
        return 0x1333;
      }
    },
  },
  iapapaberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(pokemon.baseMaxhp * 0.33);
    //     if (pokemon.getNature().minus === 'def') {
    //       pokemon.addVolatile('confusion');
    //     }
    //   },
  },
  icegem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Ice' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  icememory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  icicleplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Ice')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  insectplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Bug')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  ironball: {
    //   onEffectiveness(typeMod, target, type, move) {
    //     if (!target) { return; }
    //     if (target.volatiles['ingrain'] || target.volatiles['smackdown'] || this.field.getPseudoWeather('gravity')) { return; }
    //     if (move.type === 'Ground' && target.hasType('Flying')) { return 0; }
    //   },
    onModifySpe() {
      return 0x800;
    },
  },
  ironplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Steel')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  jabocaberry: {
    //   onDamagingHit(damage, target, source, move) {
    //     if (move.category === 'Physical') {
    //       if (target.eatItem()) {
    //         this.damage(source.baseMaxhp / 8, source, target);
    //       }
    //     }
    //   },
    //   onEat() { },
  },
  kasibberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Ghost') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  kebiaberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Poison') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  keeberry: {
    //   onAfterMoveSecondary(target, source, move) {
    //     if (move.category === 'Physical') {
    //       if (move.id === 'present' && move.heal) { return; }
    //       target.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     this.boost({def: 1});
    //   },
  },
  kingsrock: {
    //   onModifyMove(move) {
    //     if (move.category !== "Status") {
    //       if (!move.secondaries) { move.secondaries = []; }
    //       for (const secondary of move.secondaries) {
    //         if (secondary.volatileStatus === 'flinch') { return; }
    //       }
    //       move.secondaries.push({
    //         chance: 10,
    //         volatileStatus: 'flinch',
    //       });
    //     }
    //   },
  },
  laggingtail: {
    //   onFractionalPriority(priority, pokemon) {
    //     return Math.round(priority) - 0.1;
    //   },
  },
  lansatberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     pokemon.addVolatile('focusenergy');
    //   },
  },
  laxincense: {
    //   onModifyAccuracy(accuracy) {
    //     if (typeof accuracy !== 'number') { return; }
    //     this.debug('lax incense - decreasing accuracy');
    //     return accuracy * 0.9;
    //   },
  },
  leek: {
    //   onModifyCritRatio(critRatio, user) {
    //     if (["Farfetch'd", "Sirfetch'd"].includes(user.baseSpecies.baseSpecies)) {
    //       return critRatio + 2;
    //     }
    //   },
  },
  leftovers: {
    //   onResidual(pokemon) {
    //     if (this.field.isTerrain('grassyterrain')) { return; }
    //     this.heal(pokemon.baseMaxhp / 16);
    //   },
    //   onTerrain(pokemon) {
    //     if (!this.field.isTerrain('grassyterrain')) { return; }
    //     this.heal(pokemon.baseMaxhp / 16);
    //   },
  },
  leppaberry: {
    //   onUpdate(pokemon) {
    //     if (!pokemon.hp) { return; }
    //     if (pokemon.moveSlots.some(move => move.pp === 0)) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     const moveSlot = pokemon.moveSlots.find(move => move.pp === 0) ||
    //               pokemon.moveSlots.find(move => move.pp < move.maxpp);
    //     if (!moveSlot) { return; }
    //     moveSlot.pp += 10;
    //     if (moveSlot.pp > moveSlot.maxpp) { moveSlot.pp = moveSlot.maxpp; }
    //     this.add('-activate', pokemon, 'item: Leppa Berry', moveSlot.move, '[consumed]');
    //   },
  },
  liechiberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     this.boost({atk: 1});
    //   },
  },
  lifeorb: {
    onModifyDamageAttacker() {
      return 0x14cc;
    },
    // onAfterMoveSecondarySelf(source, target, move) {
    //   if (source && source !== target && move && move.category !== 'Status') {
    //     this.damage(source.baseMaxhp / 10, source, source, this.dex.getItem('lifeorb'));
    //   }
    // },
  },
  lightball: {
    onModifyAtk(pokemon: Context.Pokemon) {
      if (pokemon.species.baseSpecies === 'Pikachu') {
        return 0x2000;
      }
    },
    onModifySpA(pokemon: Context.Pokemon) {
      if (pokemon.species.baseSpecies === 'Pikachu') {
        return 0x2000;
      }
    },
  },
  luckypunch: {
    //   onModifyCritRatio(critRatio, user) {
    //     if (user.baseSpecies.name === 'Chansey') {
    //       return critRatio + 2;
    //     }
    //   },
  },
  lumberry: {
    //   onAfterSetStatus(status, pokemon) {
    //     pokemon.eatItem();
    //   },
    //   onUpdate(pokemon) {
    //     if (pokemon.status || pokemon.volatiles['confusion']) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     pokemon.cureStatus();
    //     pokemon.removeVolatile('confusion');
    //   },
  },
  luminousmoss: {
    //   onDamagingHit(damage, target, source, move) {
    //     if (move.type === 'Water') {
    //       target.useItem();
    //     }
    //   },
  },
  lustrousorb: {
    onBasePower(pokemon: Context.Pokemon) {
      if (pokemon.species.name === 'Palkia' && (is(pokemon.move?.type, 'Water') || is(pokemon.move?.type, 'Dragon'))) {
        return 0x1333;
      }
    },
  },
  machobrace: {
    onModifySpe() {
      return 0x800;
    },
  },
  magnet: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Electric')) {
        return 0x1333;
      }
    },
  },
  magoberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(pokemon.baseMaxhp * 0.33);
    //     if (pokemon.getNature().minus === 'spe') {
    //       pokemon.addVolatile('confusion');
    //     }
    //   },
  },
  mail: {
    //   onTakeItem(item, source) {
    //     if (!this.activeMove) { return false; }
    //     if (this.activeMove.id !== 'knockoff' && this.activeMove.id !== 'thief' && this.activeMove.id !== 'covet') { return false; }
    //   },
  },
  marangaberry: {
    //   onAfterMoveSecondary(target, source, move) {
    //     if (move.category === 'Special') {
    //       target.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     this.boost({spd: 1});
    //   },
  },
  meadowplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Grass')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  mentalherb: {
    //   fling: {
    //     effect(pokemon) {
    //       const conditions = ['attract', 'taunt', 'encore', 'torment', 'disable', 'healblock'];
    //       for (const firstCondition of conditions) {
    //         if (pokemon.volatiles[firstCondition]) {
    //           for (const secondCondition of conditions) {
    //             pokemon.removeVolatile(secondCondition);
    //             if (firstCondition === 'attract' && secondCondition === 'attract') {
    //               this.add('-end', pokemon, 'move: Attract', '[from] item: Mental Herb');
    //             }
    //           }
    //           return;
    //         }
    //       }
    //     },
    //   },
    //   onUpdate(pokemon) {
    //     const conditions = ['attract', 'taunt', 'encore', 'torment', 'disable', 'healblock'];
    //     for (const firstCondition of conditions) {
    //       if (pokemon.volatiles[firstCondition]) {
    //         if (!pokemon.useItem()) { return; }
    //         for (const secondCondition of conditions) {
    //           pokemon.removeVolatile(secondCondition);
    //           if (firstCondition === 'attract' && secondCondition === 'attract') {
    //             this.add('-end', pokemon, 'move: Attract', '[from] item: Mental Herb');
    //           }
    //         }
    //         return;
    //       }
    //     }
    //   },
  },
  metalcoat: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Steel')) {
        return 0x1333;
      }
    },
  },
  metalpowder: {
    onModifyDef(pokemon: Context.Pokemon) {
      if (pokemon.species.name === 'Ditto' && !pokemon.transformed) {
        return 0x2000;
      }
    },
  },
  metronome: {
    //   onStart(pokemon) {
    //     pokemon.addVolatile('metronome');
    //   },
    //   effect: {
    //     onStart(pokemon) {
    //       this.effectData.numConsecutive = 0;
    //       this.effectData.lastMove = '';
    //     },
    //     onTryMove(pokemon, target, move) {
    //       if (!pokemon.hasItem('metronome')) {
    //         pokemon.removeVolatile('metronome');
    //         return;
    //       }
    //       if (this.effectData.lastMove === move.id && pokemon.moveLastTurnResult) {
    //         this.effectData.numConsecutive++;
    //       } else {
    //         this.effectData.numConsecutive = 0;
    //       }
    //       this.effectData.lastMove = move.id;
    //     },
    onModifyDamageAttacker(pokemon: Context.Pokemon) {
      const dmgMod = [0x1000, 0x1333, 0x1666, 0x1999, 0x1ccc];
      return pokemon.move?.consecutive && pokemon.move.consecutive < 5 ? dmgMod[pokemon.move.consecutive] : 0x2000;
    },
    //   },
  },
  micleberry: {
    //   onResidual(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     pokemon.addVolatile('micleberry');
    //   },
    //   effect: {
    //     onSourceModifyAccuracy(accuracy, target, source) {
    //       this.add('-enditem', source, 'Micle Berry');
    //       source.removeVolatile('micleberry');
    //       if (typeof accuracy === 'number') {
    //         return accuracy * 1.2;
    //       }
    //     },
    //   },
  },
  mindplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Psychic')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  miracleseed: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Grass')) {
        return 0x1333;
      }
    },
  },
  mistyseed: {
    //   onStart(pokemon) {
    //     if (!pokemon.ignoringItem() && this.field.isTerrain('mistyterrain')) {
    //       pokemon.useItem();
    //     }
    //   },
    //   onAnyTerrainStart() {
    //     const pokemon = this.effectData.target;
    //     if (this.field.isTerrain('mistyterrain')) {
    //       pokemon.useItem();
    //     }
    //   },
  },
  muscleband: {
    onBasePower(pokemon: Context.Pokemon) {
      if (pokemon.move?.category === 'Physical') {
        return 0x1199;
      }
    },
  },
  mysticwater: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Water')) {
        return 0x1333;
      }
    },
  },
  nevermeltice: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Ice')) {
        return 0x1333;
      }
    },
  },
  normalgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     const pledges = ['firepledge', 'grasspledge', 'waterpledge'];
    //     if (target === source || move.category === 'Status' || pledges.includes(move.id)) { return; }
    //     if (move.type === 'Normal' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  occaberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Fire') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  oddincense: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Psychic')) {
        return 0x1333;
      }
    },
  },
  oranberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 2) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(10);
    //   },
  },
  passhoberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Water') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  payapaberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Psychic') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  pechaberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'psn' || pokemon.status === 'tox') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'psn' || pokemon.status === 'tox') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  persimberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.volatiles['confusion']) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     pokemon.removeVolatile('confusion');
    //   },
  },
  petayaberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     this.boost({spa: 1});
    //   },
  },
  pixieplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Fairy')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  poisonbarb: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Poison')) {
        return 0x1333;
      }
    },
  },
  poisongem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Poison' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  poisonmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  poweranklet: {
    onModifySpe() {
      return 0x800;
    },
  },
  powerband: {
    onModifySpe() {
      return 0x800;
    },
  },
  powerbelt: {
    onModifySpe() {
      return 0x800;
    },
  },
  powerbracer: {
    onModifySpe() {
      return 0x800;
    },
  },
  powerherb: {
    //   onChargeMove(pokemon, target, move) {
    //     if (pokemon.useItem()) {
    //       this.debug('power herb - remove charge turn for ' + move.id);
    //       this.attrLastMove('[still]');
    //       this.addMove('-anim', pokemon, move.name, target);
    //       return false; // skip charge turn
    //     }
    //   },
  },
  powerlens: {
    onModifySpe() {
      return 0x800;
    },
  },
  powerweight: {
    onModifySpe() {
      return 0x800;
    },
  },
  protectivepads: {
    //   onAttract(target, source) {
    //     if (target !== source && target === this.activePokemon &&
    //               this.activeMove && this.activeMove.flags['contact']) { return false; }
    //   },
    //   onBoost(boost, target, source, effect) {
    //     if (target !== source && target === this.activePokemon && this.activeMove && this.activeMove.flags['contact']) {
    //       if (effect && effect.effectType === 'Ability') {
    //             Ability activation always happens for boosts
    //         this.add('-activate', target, 'item: Protective Pads');
    //       }
    //       return false;
    //     }
    //   },
    //   onDamage(damage, target, source, effect) {
    //     if (target !== source && target === this.activePokemon && this.activeMove && this.activeMove.flags['contact']) {
    //       if (effect && effect.effectType === 'Ability') {
    //         this.add('-activate', source, effect.fullname);
    //         this.add('-activate', target, 'item: Protective Pads');
    //       }
    //       return false;
    //     }
    //   },
    //   onSetAbility(ability, target, source, effect) {
    //     if (target !== source && target === this.activePokemon && this.activeMove && this.activeMove.flags['contact']) {
    //       if (effect && effect.effectType === 'Ability') {
    //         this.add('-activate', source, effect.fullname);
    //         this.add('-activate', target, 'item: Protective Pads');
    //       }
    //       return false;
    //     }
    //   },
    //   onSetStatus(status, target, source, effect) {
    //     if (target !== source && target === this.activePokemon &&
    //               this.activeMove && this.activeMove.flags['contact']) { return false; }
    //   },
  },
  psychicgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Psychic' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  psychicmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  psychicseed: {
    //   onStart(pokemon) {
    //     if (!pokemon.ignoringItem() && this.field.isTerrain('psychicterrain')) {
    //       pokemon.useItem();
    //     }
    //   },
    //   onAnyTerrainStart() {
    //     const pokemon = this.effectData.target;
    //     if (this.field.isTerrain('psychicterrain')) {
    //       pokemon.useItem();
    //     }
    //   },
  },
  quickclaw: {
    //   onFractionalPriority(priority, pokemon) {
    //     if (this.randomChance(1, 5)) {
    //       this.add('-activate', pokemon, 'item: Quick Claw');
    //       return Math.round(priority) + 0.1;
    //     }
    //   },
  },
  quickpowder: {
    onModifySpe(pokemon: Context.Pokemon) {
      if (pokemon.species.name === 'Ditto' && !pokemon.transformed) {
        return 0x2000;
      }
    },
  },
  rawstberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'brn') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'brn') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  razorclaw: {
    //   onModifyCritRatio(critRatio) {
    //     return critRatio + 1;
    //   },
  },
  razorfang: {
    //   onModifyMove(move) {
    //     if (move.category !== "Status") {
    //       if (!move.secondaries) { move.secondaries = []; }
    //       for (const secondary of move.secondaries) {
    //         if (secondary.volatileStatus === 'flinch') { return; }
    //       }
    //       move.secondaries.push({
    //         chance: 10,
    //         volatileStatus: 'flinch',
    //       });
    //     }
    //   },
  },
  redcard: {
    //   onAfterMoveSecondary(target, source, move) {
    //     if (source && source !== target && source.hp && target.hp && move && move.category !== 'Status') {
    //       if (!source.isActive || !this.canSwitch(source.side) || source.forceSwitchFlag || target.forceSwitchFlag) {
    //         return;
    //       }
    //           The item is used up even against a pokemon with Ingrain or that otherwise can't be forced out
    //       if (target.useItem(source)) {
    //         if (this.runEvent('DragOut', source, target, move)) {
    //           source.forceSwitchFlag = true;
    //         }
    //       }
    //     }
    //   },
  },
  redorb: {
    //   onSwitchIn(pokemon) {
    //     if (pokemon.isActive && pokemon.baseSpecies.name === 'Groudon') {
    //       this.queue.insertChoice({choice: 'runPrimal', pokemon: pokemon});
    //     }
    //   },
    //   onPrimal(pokemon) {
    //     pokemon.formeChange('Groudon-Primal', this.effect, true);
    //   },
    //   onTakeItem(item, source) {
    //     if (source.baseSpecies.baseSpecies === 'Groudon') { return false; }
    //     return true;
    //   },
  },
  rindoberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Grass') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  rockgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Rock' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  rockincense: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Rock')) {
        return 0x1333;
      }
    },
  },
  rockmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  rockyhelmet: {
    //   onDamagingHit(damage, target, source, move) {
    //     if (move.flags['contact']) {
    //       this.damage(source.baseMaxhp / 6, source, target);
    //     }
    //   },
  },
  roomservice: {
    //   onUpdate(pokemon) {
    //     if (this.field.getPseudoWeather('trickroom')) {
    //       pokemon.useItem();
    //     }
    //   },
  },
  roseincense: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Grass')) {
        return 0x1333;
      }
    },
  },
  roseliberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Fairy') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  rowapberry: {
    //   onDamagingHit(damage, target, source, move) {
    //     if (move.category === 'Special') {
    //       if (target.eatItem()) {
    //         this.damage(source.baseMaxhp / 8, source, target);
    //       }
    //     }
    //   },
    //   onEat() { },
  },
  rustedshield: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 889) || pokemon.baseSpecies.num === 889) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  rustedsword: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 888) || pokemon.baseSpecies.num === 888) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  safetygoggles: {
    //   onImmunity(type, pokemon) {
    //     if (type === 'sandstorm' || type === 'hail' || type === 'powder') { return false; }
    //   },
    //   onTryHit(pokemon, source, move) {
    //     if (move.flags['powder'] && pokemon !== source && this.dex.getImmunity('powder', pokemon)) {
    //       this.add('-activate', pokemon, 'item: Safety Goggles', move.name);
    //       return null;
    //     }
    //   },
  },
  salacberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     this.boost({spe: 1});
    //   },
  },
  scopelens: {
    //   onModifyCritRatio(critRatio) {
    //     return critRatio + 1;
    //   },
  },
  seaincense: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Water')) {
        return 0x1333;
      }
    },
  },
  sharpbeak: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Flying')) {
        return 0x1333;
      }
    },
  },
  shedshell: {
    //   onTrapPokemon(pokemon) {
    //     pokemon.trapped = pokemon.maybeTrapped = false;
    //   },
  },
  shellbell: {
    //   onAfterMoveSecondarySelf(pokemon, target, move) {
    //     if (move.category !== 'Status') {
    //       this.heal(pokemon.lastDamage / 8, pokemon);
    //     }
    //   },
  },
  shockdrive: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 649) || pokemon.baseSpecies.num === 649) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  shucaberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Ground') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  silkscarf: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Normal')) {
        return 0x1333;
      }
    },
  },
  silverpowder: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Bug')) {
        return 0x1333;
      }
    },
  },
  sitrusberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 2) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(pokemon.baseMaxhp / 4);
    //   },
  },
  skyplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Flying')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  snowball: {
    //   onDamagingHit(damage, target, source, move) {
    //     if (move.type === 'Ice') {
    //       target.useItem();
    //     }
    //   },
  },
  softsand: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Ground')) {
        return 0x1333;
      }
    },
  },
  souldew: {
    onBasePower(pokemon: Context.Pokemon) {
      if ((pokemon.species.num === 380 || pokemon.species.num === 381) && (is(pokemon.move?.type, 'Psychic') || is(pokemon.move?.type, 'Dragon'))) {
        return 0x1333;
      }
    },
  },
  spelltag: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Ghost')) {
        return 0x1333;
      }
    },
  },
  splashplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Water')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  spookyplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Ghost')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  starfberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     const stats = [];
    //     let stat;
    //     for (stat in pokemon.boosts) {
    //       if (stat !== 'accuracy' && stat !== 'evasion' && pokemon.boosts[stat] < 6) {
    //         stats.push(stat);
    //       }
    //     }
    //     if (stats.length) {
    //       const randomStat = this.sample(stats);
    //       const boost = {};
    //       boost[randomStat] = 2;
    //       this.boost(boost);
    //     }
    //   },
  },
  steelgem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     if (target === source || move.category === 'Status') { return; }
    //     if (move.type === 'Steel' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  steelmemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  stick: {
    //   onModifyCritRatio(critRatio, user) {
    //     if (user.baseSpecies.name === 'Farfetch\'d') {
    //       return critRatio + 2;
    //     }
    //   },
  },
  stickybarb: {
    //   onResidual(pokemon) {
    //     this.damage(pokemon.baseMaxhp / 8);
    //   },
    //   onHit(target, source, move) {
    //     if (source && source !== target && !source.item && move && move.flags['contact']) {
    //       const barb = target.takeItem();
    //       if (!barb) { return; } // Gen 4 Multitype
    //       source.setItem(barb);
    //           no message for Sticky Barb changing hands
    //     }
    //   },
  },
  stoneplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Rock')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  tangaberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Bug') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  thickclub: {
    onModifyAtk(pokemon: Context.Pokemon) {
      if (pokemon.species.baseSpecies === 'Cubone' || pokemon.species.baseSpecies === 'Marowak') {
        return 0x2000;
      }
    },
  },
  throatspray: {
    //   onAfterMoveSecondarySelf(target, source, move) {
    //     if (move.flags['sound']) {
    //       target.useItem();
    //     }
    //   },
  },
  toxicorb: {
    //   onResidual(pokemon) {
    //     pokemon.trySetStatus('tox', pokemon);
    //   },
  },
  toxicplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Poison')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  twistedspoon: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Psychic')) {
        return 0x1333;
      }
    },
  },
  wacanberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move?.type, 'Electric') && pokemon.move?.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  watergem: {
    //   onSourceTryPrimaryHit(target, source, move) {
    //     const pledges = ['firepledge', 'grasspledge', 'waterpledge'];
    //     if (target === source || move.category === 'Status' || pledges.includes(move.id)) { return; }
    //     if (move.type === 'Water' && source.useItem()) {
    //       source.addVolatile('gem');
    //     }
    //   },
  },
  watermemory: {
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 773) || pokemon.baseSpecies.num === 773) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  waveincense: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Water')) {
        return 0x1333;
      }
    },
  },
  weaknesspolicy: {
    //   onHit(target, source, move) {
    //     if (target.hp && move.category !== 'Status' && !move.damage &&
    //               !move.damageCallback && target.getMoveHitData(move).typeMod > 0) {
    //       target.useItem();
    //     }
    //   },
  },
  whiteherb: {
    //   fling: {
    //     effect(pokemon) {
    //       let activate = false;
    //       const boosts = {};
    //       let i;
    //       for (i in pokemon.boosts) {
    //         if (pokemon.boosts[i] < 0) {
    //           activate = true;
    //           boosts[i] = 0;
    //         }
    //       }
    //       if (activate) {
    //         pokemon.setBoost(boosts);
    //         this.add('-clearnegativeboost', pokemon, '[silent]');
    //       }
    //     },
    //   },
    //   onUpdate(pokemon) {
    //     let activate = false;
    //     const boosts = {};
    //     let i;
    //     for (i in pokemon.boosts) {
    //       if (pokemon.boosts[i] < 0) {
    //         activate = true;
    //         boosts[i] = 0;
    //       }
    //     }
    //     if (activate && pokemon.useItem()) {
    //       pokemon.setBoost(boosts);
    //       this.add('-clearnegativeboost', pokemon, '[silent]');
    //     }
    //   },
  },
  widelens: {
    //   onSourceModifyAccuracy(accuracy) {
    //     if (typeof accuracy === 'number') {
    //       return accuracy * 1.1;
    //     }
    //   },
  },
  wikiberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.hasAbility('gluttony'))) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(pokemon.baseMaxhp * 0.33);
    //     if (pokemon.getNature().minus === 'spa') {
    //       pokemon.addVolatile('confusion');
    //     }
    //   },
  },
  wiseglasses: {
    onBasePower(pokemon: Context.Pokemon) {
      if (pokemon.move?.category === 'Special') {
        return 0x1199;
      }
    },
  },
  yacheberry: {
    onModifyDamageDefender(pokemon: Context.Pokemon) {
      if (pokemon.move && is(pokemon.move.type, 'Ice') && pokemon.move.effectiveness > 1) {
        const hitSub = pokemon.volatiles['substitute'] && !(pokemon.move.infiltrates && pokemon.gen.num >= 6);
        if (hitSub) {
          return;
        }
        // if (target.eatItem()) {
        return 0x800;
        // }
      }
    },
    //   onEat() { },
  },
  zapplate: {
    onBasePower(pokemon: Context.Pokemon) {
      if (is(pokemon.move?.type, 'Electric')) {
        return 0x1333;
      }
    },
    //   onTakeItem(item, pokemon, source) {
    //     if ((source && source.baseSpecies.num === 493) || pokemon.baseSpecies.num === 493) {
    //       return false;
    //     }
    //     return true;
    //   },
  },
  zoomlens: {
    //   onSourceModifyAccuracy(accuracy, target) {
    //     if (typeof accuracy === 'number' && !this.queue.willMove(target)) {
    //       this.debug('Zoom Lens boosting accuracy');
    //       return accuracy * 1.2;
    //     }
    //   },
  },
  berserkgene: {
    //   onUpdate(pokemon) {
    //     this.boost({atk: 2});
    //     pokemon.addVolatile('confusion');
    //     pokemon.setItem('');
    //   },
  },
  berry: {
    //   onResidual(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 2) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(10);
    //   },
  },
  bitterberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.volatiles['confusion']) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     pokemon.removeVolatile('confusion');
    //   },
  },
  burntberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'frz') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'frz') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  goldberry: {
    //   onResidual(pokemon) {
    //     if (pokemon.hp <= pokemon.maxhp / 2) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onTryEatItem(item, pokemon) {
    //     if (!this.runEvent('TryHeal', pokemon)) { return false; }
    //   },
    //   onEat(pokemon) {
    //     this.heal(30);
    //   },
  },
  iceberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'brn') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'brn') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  mintberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'slp') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'slp') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  miracleberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status || pokemon.volatiles['confusion']) {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     pokemon.cureStatus();
    //     pokemon.removeVolatile('confusion');
    //   },
  },
  mysteryberry: {
    //   onUpdate(pokemon) {
    //     if (!pokemon.hp) { return; }
    //     const moveSlot = pokemon.lastMove && pokemon.getMoveData(pokemon.lastMove.id);
    //     if (moveSlot && moveSlot.pp === 0) {
    //       pokemon.addVolatile('leppaberry');
    //       pokemon.volatiles['leppaberry'].moveSlot = moveSlot;
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     let moveSlot;
    //     if (pokemon.volatiles['leppaberry']) {
    //       moveSlot = pokemon.volatiles['leppaberry'].moveSlot;
    //       pokemon.removeVolatile('leppaberry');
    //     } else {
    //       let pp = 99;
    //       for (const possibleMoveSlot of pokemon.moveSlots) {
    //         if (possibleMoveSlot.pp < pp) {
    //           moveSlot = possibleMoveSlot;
    //           pp = moveSlot.pp;
    //         }
    //       }
    //     }
    //     moveSlot.pp += 5;
    //     if (moveSlot.pp > moveSlot.maxpp) { moveSlot.pp = moveSlot.maxpp; }
    //     this.add('-activate', pokemon, 'item: Mystery Berry', moveSlot.move);
    //   },
  },
  pinkbow: {
    //   onBasePower(basePower, user, target, move) {
    //     if (move.type === 'Normal') {
    //       return basePower * 1.1;
    //     }
    //   },
  },
  polkadotbow: {
    //   onBasePower(basePower, user, target, move) {
    //     if (move.type === 'Normal') {
    //       return basePower * 1.1;
    //     }
    //   },
  },
  przcureberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'par') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'par') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
  psncureberry: {
    //   onUpdate(pokemon) {
    //     if (pokemon.status === 'psn' || pokemon.status === 'tox') {
    //       pokemon.eatItem();
    //     }
    //   },
    //   onEat(pokemon) {
    //     if (pokemon.status === 'psn' || pokemon.status === 'tox') {
    //       pokemon.cureStatus();
    //     }
    //   },
  },
};
