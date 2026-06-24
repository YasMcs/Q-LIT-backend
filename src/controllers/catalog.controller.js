import { getCatalogs } from '../services/catalog.service.js';

export const listCatalogs = async (req, res, next) => {
  try {
    const catalogs = await getCatalogs();
    res.status(200).json({
      status: "success",
      data: catalogs
    });
  } catch (error) {
    next(error);
  }
};
