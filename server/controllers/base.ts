import { Request, Response } from 'express';
import { Model } from 'mongoose';

abstract class BaseCtrl<T> {

  abstract model:Model<T>

  getAll = async (req: Request, res: Response) => {
    try {
      const docs = await this.model.find({});
      return res.status(200).json(docs);
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };

  // Count all
  count = async (req: Request, res: Response) => {
    try {
      const count = await this.model.countDocuments();
      return res.status(200).json(count);
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };

  // Insert
  insert = async (req: Request, res: Response) => {
    try {
      const obj = await new this.model(req.body).save();
      return res.status(201).json(obj);
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };

  // Get by id
  get = async (req: Request, res: Response) => {
    try {
      const obj = await this.model.findOne({ _id: req.params.id });
      return res.status(200).json(obj);
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(500).json({ error });
    }
  };

  // Update by id
  update = async (req: Request, res: Response) => {
    try {
      await this.model.findOneAndUpdate({ _id: req.params.id }, req.body);
      return res.status(200).json({ message: "OK" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };

  // Delete by id
  delete = async (req: Request, res: Response) => {
    try {
      await this.model.findOneAndDelete({ _id: req.params.id });
      return res.status(200).json({ message: "OK" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };

  // Drop collection (for tests)
  deleteAll = async (_req: Request, res: Response) => {
    try {
      await this.model.deleteMany();
      return res.status(200).json({ message: "OK" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unknown error occurred";
      return res.status(400).json({ error });
    }
  };
}

export default BaseCtrl;
