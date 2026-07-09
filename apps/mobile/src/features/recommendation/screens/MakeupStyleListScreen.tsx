import {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import {Search, Trash2} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {getMakeupLooks} from '../../../shared/services/makeupService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupLook} from '../../../shared/types/myPage';
import {
  AppHeader,
  AppScreen,
  ImagePlaceholder,
  PagedGrid,
} from '../../../shared/ui';

type MakeupStyleListScreenProps = {
  onBack?: () => void;
};

export function MakeupStyleListScreen({onBack}: MakeupStyleListScreenProps) {
  const {width} = useWindowDimensions();
  const [looks, setLooks] = useState<MakeupLook[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleLooks = useMemo(() => {
    if (!normalizedSearchQuery) {
      return looks;
    }

    return looks.filter((look) => {
      const searchableText = [
        look.title,
        look.moodLabel,
        look.shortDescription,
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearchQuery);
    });
  }, [looks, normalizedSearchQuery]);

  useEffect(() => {
    let isMounted = true;

    getMakeupLooks().then((nextLooks) => {
      if (isMounted) {
        setLooks(nextLooks.filter((look) => look.isSaved));
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDeleteLook = (look: MakeupLook) => {
    Alert.alert(
      '저장된 메이크업 삭제',
      `'${look.title}'을 삭제하시겠습니까?`,
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '삭제',
          onPress: () => {
            setLooks((currentLooks) =>
              currentLooks.filter((currentLook) => currentLook.id !== look.id),
            );
          },
          style: 'destructive',
        },
      ],
    );
  };

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <AppHeader onBack={onBack} title="저장된 메이크업" />

      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Search color={colors.textSecondary} size={iconSize.sm} strokeWidth={1.8} />
          <TextInput
            accessibilityLabel="저장된 메이크업 검색"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchQuery}
            placeholder="저장된 메이크업 검색"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            value={searchQuery}
          />
        </View>
      </View>

      {visibleLooks.length > 0 ? (
        <PagedGrid
          data={visibleLooks}
          keyExtractor={(look) => look.id}
          pageSize={10}
          pageStyle={[styles.grid, {gap}]}
          pageWidth={contentWidth}
          renderItem={(look) => (
            <View style={[styles.card, {width: cardWidth}]}>
              <View style={styles.imageArea}>
                <ImagePlaceholder
                  borderRadius={radius.md}
                  resizeMode="cover"
                  source={look.imageSource}
                />
                <Pressable
                  accessibilityLabel={`${look.title} 삭제`}
                  accessibilityRole="button"
                  onPress={() => handleDeleteLook(look)}
                  style={styles.deleteButton}>
                  <Trash2 color={colors.textPrimary} size={iconSize.xs} strokeWidth={1.9} />
                </Pressable>
              </View>
              <Text numberOfLines={1} style={styles.title}>
                {look.title}
              </Text>
            </View>
          )}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>저장된 메이크업이 없어요.</Text>
          <Text style={styles.emptyDescription}>다른 키워드로 다시 검색해 보세요.</Text>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    minWidth: 0,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.liquidGlassBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 32,
  },
  emptyDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  imageArea: {
    aspectRatio: 0.82,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingVertical: 0,
  },
  searchSection: {
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
});
