// Оригинальные иллюстрации школы. Все файлы загружаются с сайта школы и доступны без сети.
export const ARTWORK = [
  ['lighthouse-puppies', 'Щенки у маяка'],
  ['turtle-octopus', 'Черепашка и осьминог чинят батискаф'],
  ['spider-rescuer', 'Паучок строит мост'],
  ['night-glider', 'Ночной полёт за роботом'],
  ['cats-and-race-car', 'Котята готовят машину к гонке'],
  ['winter-capybara', 'Капибара наряжает ёлку'],
  ['sea-sponge', 'Подводная почта'],
  ['moon-music', 'Лунный оркестр'],
].map(([id, title]) => ({ id, title, src: `artwork/${id}.jpg` }));

export const artForIsland = island => ARTWORK[island.n % ARTWORK.length];
