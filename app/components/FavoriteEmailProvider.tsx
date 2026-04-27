'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import FavoriteEmailPrompt from './FavoriteEmailPrompt';

interface FavoriteEmailContextValue {
  /** Call after a favorite is added (not removed) to check if we should show the prompt */
  notifyFavoriteAdded: (count: number, favorites: Array<{ id: string; listingType: 'sale' | 'rent' }>) => void;
}

const FavoriteEmailContext = createContext<FavoriteEmailContextValue>({
  notifyFavoriteAdded: () => {},
});

export function useFavoriteEmailPrompt() {
  return useContext(FavoriteEmailContext);
}

export default function FavoriteEmailProvider({ children }: { children: ReactNode }) {
  const [promptCount, setPromptCount] = useState(0);
  const [promptFavorites, setPromptFavorites] = useState<Array<{ id: string; listingType: 'sale' | 'rent' }>>([]);

  const notifyFavoriteAdded = useCallback(
    (count: number, favorites: Array<{ id: string; listingType: 'sale' | 'rent' }>) => {
      setPromptCount(count);
      setPromptFavorites(favorites);
    },
    []
  );

  return (
    <FavoriteEmailContext.Provider value={{ notifyFavoriteAdded }}>
      {children}
      <FavoriteEmailPrompt
        favoriteCount={promptCount}
        favorites={promptFavorites}
        mode="modal"
      />
    </FavoriteEmailContext.Provider>
  );
}
