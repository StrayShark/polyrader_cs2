import { Star, Bell, Settings2 } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, CardTitle } from '@/components/ui';

export function WhaleFollowGuide() {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="border-b px-6 py-3">
        <CardTitle className="text-sm">{t('whales.followGuideTitle')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('whales.followGuideDesc')}</p>
      </CardHeader>
      <div className="grid gap-4 p-6 md:grid-cols-3">
        {[
          { icon: Star, title: t('whales.followGuideStep1Title'), desc: t('whales.followGuideStep1Desc') },
          { icon: Settings2, title: t('whales.followGuideStep2Title'), desc: t('whales.followGuideStep2Desc') },
          { icon: Bell, title: t('whales.followGuideStep3Title'), desc: t('whales.followGuideStep3Desc') },
        ].map((step) => (
          <div key={step.title} className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-4">
            <step.icon className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">{step.title}</div>
            <p className="text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
