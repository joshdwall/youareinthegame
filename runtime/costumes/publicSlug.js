const aliases = { rockerfit: 'rocknroll', ghostremake: 'ghost' };

export function costumeSlug(id) {
  return Object.hasOwn(aliases, id) ? aliases[id] : id.replaceAll('-', '');
}

export function costumeIdForSlug(slug) {
  return Object.keys(aliases).find(id => aliases[id] === slug) || slug;
}
