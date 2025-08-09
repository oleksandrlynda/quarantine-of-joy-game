// Enemy management: spawn, waves, simple AI tick

export class EnemyManager {
  constructor(THREE, scene, mats){
    this.THREE = THREE;
    this.scene = scene;
    this.mats = mats;
    this.enemies = new Set();
    this.wave = 1;
    this.alive = 0;
  }

  spawn(){
    const THREE = this.THREE;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.6,1.2), this.mats.enemy);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.9), this.mats.head); head.position.y = 1.4; body.add(head);
    body.position.set((Math.random()*60-30)|0, 0.8, (Math.random()*60-30)|0);
    body.userData = { hp: 100, head, speed: 2.4 + Math.random()*0.8 };
    this.scene.add(body); this.enemies.add(body);
  }

  startWave(){
    for(let i=0;i<3+this.wave;i++) this.spawn();
    this.alive = this.enemies.size;
  }

  reset(){
    for(const e of this.enemies){ this.scene.remove(e); }
    this.enemies.clear();
    this.wave = 1; this.alive = 0;
    this.startWave();
  }

  tickAI(playerObject, dt, onPlayerDamage){
    for(const e of this.enemies){
      const toPlayer = playerObject.position.clone().sub(e.position);
      const dist = toPlayer.length();
      if(dist<2.1){
        if(onPlayerDamage) onPlayerDamage(15*dt);
      }
      if(dist<40){ toPlayer.y=0; toPlayer.normalize(); e.position.add(toPlayer.multiplyScalar(e.userData.speed*dt)); }
    }
  }

  applyHit(hitObject, isHead, damage){
    // find root enemy mesh from a possibly child head mesh
    let obj = hitObject; while(obj && !this.enemies.has(obj)){ obj = obj.parent; }
    if(!obj) return { killed:false };
    obj.userData.hp -= damage;
    return { enemy: obj, killed: obj.userData.hp <= 0 };
  }

  remove(enemy){
    if(this.enemies.has(enemy)){
      this.enemies.delete(enemy);
      this.scene.remove(enemy);
      this.alive--;
      if(this.alive<=0){ this.wave++; this.startWave(); }
    }
  }
}


