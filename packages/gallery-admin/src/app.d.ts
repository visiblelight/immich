import type { GalleryUser } from '@gallery/core';
declare global {
  namespace App {
    interface Locals {
      user: GalleryUser | null;
    }
  }
}
export {};
