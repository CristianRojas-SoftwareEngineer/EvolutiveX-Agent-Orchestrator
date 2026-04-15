import { Item } from '../interfaces/item.interface';

export class ItemsService {
  private items: Item[] = [];

  public async getAllItems(): Promise<Item[]> {
    return this.items;
  }

  public async getItemById(id: string): Promise<Item | undefined> {
    return this.items.find((item) => item.id === id);
  }

  public async createItem(item: Omit<Item, 'id'>): Promise<Item> {
    const newItem: Item = {
      id: Math.random().toString(36).substr(2, 9),
      ...item,
    };
    this.items.push(newItem);
    return newItem;
  }

  public async updateItem(id: string, itemData: Omit<Item, 'id'>): Promise<Item | undefined> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return undefined;

    this.items[index] = { id, ...itemData };
    return this.items[index];
  }

  public async deleteItem(id: string): Promise<boolean> {
    const initialLength = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    return this.items.length !== initialLength;
  }
}
