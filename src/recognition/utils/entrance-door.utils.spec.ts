import { OrderItem } from '../recognition.types';
import { finalizeEntranceDoor } from './entrance-door.utils';

interface Stvorka {
  openSide: string;
  parameters: Array<{ name: string; value: string }>;
}
const stvorkaOf = (item: OrderItem) => item.stvorka as Stvorka;

const door = (overrides: object = {}) => ({
  constructionType: 'Дверь входная открывание наружу',
  profileName: '',
  furnitureName: '',
  width: 700,
  height: 2120,
  qu: 1,
  stvorka: { openType: 'povOtk', openSide: 'right' },
  ...overrides,
});

describe('finalizeEntranceDoor', () => {
  it('builds the first spec example', () => {
    const item = finalizeEntranceDoor(
      door({
        doorText: {
          title: ' Входная дверь 60 ',
          opening: 'наружу',
          handle: 'ручка скоба',
          lock: 'многозапорный замок',
          hingeCount: '3',
          closer: false,
        },
      }),
    );

    expect(item).toEqual({
      constructionType: 'Дверь входная открывание наружу',
      profileName: 'Входная дверь 60',
      furnitureName: 'Фурнитура Дверная',
      width: 700,
      height: 2120,
      qu: 1,
      stvorka: {
        openType: 'pov',
        openSide: 'right',
        parameters: [
          { name: 'Тип дверной ручки', value: 'ручка скоба' },
          { name: 'Замок', value: 'многозапорный замок' },
          { name: 'Цилиндр', value: 'Ключ-Ключ' },
          { name: 'Петли', value: 'Elementis' },
          { name: 'Количество петель', value: '3' },
          { name: 'Доводчик', value: 'Не ставить' },
        ],
      },
    });
  });

  it('uses defaults and opens inward for a Z sash without a title', () => {
    const item = finalizeEntranceDoor(
      door({ doorText: { opening: 'внутрь', handle: 'офисная ручка' } }),
    );
    expect(item.constructionType).toBe('Дверь входная открывание во внутрь');
    expect(item.profileName).toBe('Входная дверь');
    expect(stvorkaOf(item).parameters.map((p) => p.value)).toEqual([
      'офисная ручка',
      'не указано',
      'Ключ-Ключ',
      'Elementis',
      'не указано',
      'Не ставить',
    ]);
  });

  it('takes the side label, hinge name, cylinder and closer as written', () => {
    const item = finalizeEntranceDoor(
      door({
        doorText: {
          sideLabel: 'left',
          cylinder: 'ключ-барашек',
          hinges: 'Джокер',
          hingeCount: 'петли 4 шт',
          closer: true,
        },
      }),
    );
    expect(stvorkaOf(item).openSide).toBe('left');
    expect(stvorkaOf(item).parameters.slice(2)).toEqual([
      { name: 'Цилиндр', value: 'ключ-барашек' },
      { name: 'Петли', value: 'Джокер' },
      { name: 'Количество петель', value: '4' },
      { name: 'Доводчик', value: 'Ставить' },
    ]);
  });

  it('keeps ready parameters from the model in the spec order', () => {
    const item = finalizeEntranceDoor(
      door({
        stvorka: {
          openType: 'pov',
          openSide: 'right',
          parameters: [
            { name: 'Доводчик', value: 'Ставить' },
            { name: 'Замок', value: 'многозапорный замок' },
            { name: 'Количество петель', value: '3' },
          ],
        },
      }),
    );
    expect(stvorkaOf(item).parameters.map((p) => p.value)).toEqual([
      'не указано',
      'многозапорный замок',
      'Ключ-Ключ',
      'Elementis',
      '3',
      'Ставить',
    ]);
  });

  it('ignores a title without door words', () => {
    const item = finalizeEntranceDoor(
      door({ doorText: { title: 'Z створка' } }),
    );
    expect(item.profileName).toBe('Входная дверь');
  });

  it('prefers the form profile over a bare door word', () => {
    const item = finalizeEntranceDoor(
      door({ profileName: 'REHAU T116/70', doorText: { title: 'дверь' } }),
    );
    expect(item.profileName).toBe('REHAU T116/70');
  });

  it('keeps the form profile when there is no door title', () => {
    const item = finalizeEntranceDoor(door({ profileName: '70 Brusbox' }));
    expect(item.profileName).toBe('70 Brusbox');
    expect(item.furnitureName).toBe('Фурнитура Дверная');
  });

  it('leaves windows alone apart from dropping doorText', () => {
    const window = { constructionType: 'Окно', doorText: { title: 'x' } };
    expect(finalizeEntranceDoor(window)).toEqual({ constructionType: 'Окно' });
  });
});
