import { createContext, useContext } from "react";
import { getPhoto } from "./blobStore";

export type PhotoLoader = (auditId: string, photoId: string) => Promise<Blob | undefined>;
export const PhotoAccess = createContext<PhotoLoader>((_auditId, photoId) => getPhoto(photoId));
export const usePhotoLoader = () => useContext(PhotoAccess);
