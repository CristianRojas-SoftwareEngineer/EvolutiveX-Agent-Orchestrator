import { FastifyRequest, FastifyReply } from 'fastify';
import { ItemsService } from '../services/items.service';
import { Item } from '../interfaces/item.interface';

export class ItemsController {
  // Principio SOLID: Inversión de Independencia. No instanciamos el servicio internamente.
  constructor(private readonly itemsService: ItemsService) {}

  public getItems = async (request: FastifyRequest, reply: FastifyReply) => {
    const items = await this.itemsService.getAllItems();
    return reply.status(200).send({ data: items });
  };

  public getItem = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const { id } = request.params;
    const item = await this.itemsService.getItemById(id);
    if (!item) {
      return reply.status(404).send({ error: 'Item not found' });
    }
    return reply.status(200).send({ data: item });
  };

  public createItem = async (
    request: FastifyRequest<{ Body: Omit<Item, 'id'> }>,
    reply: FastifyReply,
  ) => {
    const itemData = request.body;
    const newItem = await this.itemsService.createItem(itemData);
    return reply.status(201).send({ data: newItem });
  };

  public updateItem = async (
    request: FastifyRequest<{ Params: { id: string }; Body: Omit<Item, 'id'> }>,
    reply: FastifyReply,
  ) => {
    const { id } = request.params;
    const itemData = request.body;
    const updatedItem = await this.itemsService.updateItem(id, itemData);
    if (!updatedItem) {
      return reply.status(404).send({ error: 'Item not found' });
    }
    return reply.status(200).send({ data: updatedItem });
  };

  public deleteItem = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const { id } = request.params;
    const deleted = await this.itemsService.deleteItem(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Item not found' });
    }
    return reply.status(204).send();
  };
}
