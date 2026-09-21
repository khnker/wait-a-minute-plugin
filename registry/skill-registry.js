export function createSkillRegistry() {
  const skills = {};
  return {
    register(name, skill) {
      skills[name] = skill;
    },
    lookup(name) {
      return skills[name];
    },
    getDeps(name) {
      const skill = skills[name];
      return skill && skill.deps ? skill.deps : [];
    },
    checkVersion(name, version) {
      const skill = skills[name];
      return skill ? skill.version === version : false;
    },
  };
}
